use std::collections::HashSet;

use anyhow::{Context, Result, ensure};
use dialoguer::{Confirm, console::Term};
use ente_core::Session;
use ente_photos::{dedup, files};
use serde::Serialize;
use serde_json::json;

use super::replica::Replica;
use crate::{
    args::{DuplicatesArgs, Options},
    output,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Group {
    size_bytes: u64,
    files: Vec<File>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct File {
    id: String,
    name: String,
    album_ids: Vec<String>,
}

pub async fn run(
    args: &DuplicatesArgs,
    session: &Session,
    replica: &mut Replica<'_>,
    options: &Options,
) -> Result<()> {
    let albums = replica.collections(None, None, |rows| {
        let mut albums = Vec::new();
        for row in rows {
            let entry = row?;
            let album = entry.value.with_context(|| format!("album {}", entry.id))?;
            if album.owner_id == session.user_id {
                albums.push(album);
            }
        }
        Ok(albums)
    })?;
    if options.offline {
        for album in &albums {
            ensure!(
                replica.files_synced_to(album.id)?.is_some(),
                "files for album {:?} have not finished syncing; run the command online first",
                album.name
            );
        }
    } else {
        replica.sync_files(session, &albums).await?;
    }
    let collections: Vec<_> = albums
        .iter()
        .map(|album| dedup::Collection {
            id: album.id,
            owner_id: album.owner_id,
        })
        .collect();
    let owned_ids: HashSet<_> = albums.iter().map(|album| album.id).collect();
    let entries = replica.files(None, None, None, |rows| {
        let mut entries = Vec::new();
        for row in rows {
            let entry = row?;
            if !entry.album_ids.iter().any(|id| owned_ids.contains(id)) {
                continue;
            }
            let file = entry.file.with_context(|| format!("file {}", entry.id))?;
            entries.push((file, entry.album_ids));
        }
        Ok(entries)
    })?;
    let mut files = Vec::new();
    let mut names = Vec::new();
    let mut entry_indices = Vec::new();
    for (entry_index, (file, album_ids)) in entries.iter().enumerate() {
        for &collection_id in album_ids {
            files.push(dedup::File {
                id: file.id,
                collection_id,
                owner_id: file.owner_id,
                hash: file.hash.clone(),
                size: file.size,
            });
            names.push(file.name.as_str());
            entry_indices.push(entry_index);
        }
    }
    let mut groups = dedup::find_duplicates(session.user_id, &collections, &files);
    if args.remove {
        if let Some(limit) = args.list.limit().map(|n| n as usize)
            && groups.len() > limit
        {
            groups.truncate(limit);
            eprintln!(
                "Removing duplicates from the first {limit} groups; use --limit N or --all to include more."
            );
        }
        let selected = groups
            .iter()
            .map(|group| {
                group
                    .items
                    .iter()
                    .map(|item| {
                        let (file, _) = &entries[entry_indices[item.file_index]];
                        let mut record = None;
                        for &album_id in &item.collection_ids {
                            let candidate = replica
                                .file_record(album_id, file.id)?
                                .context("duplicate file is missing from local data")?;
                            if record.as_ref().is_none_or(
                                |previous: &super::replica::FileRecord| {
                                    candidate.remote.updation_time > previous.remote.updation_time
                                },
                            ) {
                                record = Some(candidate);
                            }
                        }
                        let record = record.context("duplicate file has no owned album")?;
                        let documents = record
                            .documents
                            .as_ref()
                            .context("duplicate metadata is unavailable")?;
                        Ok(files::duplicate(
                            file,
                            documents,
                            item.collection_ids.clone(),
                        )?)
                    })
                    .collect::<Result<Vec<_>>>()
            })
            .collect::<Result<Vec<_>>>()?;
        let plan = dedup::plan_removal(&selected);
        if !plan.trash_ids.is_empty() {
            if !args.yes {
                let accepted = Confirm::new()
                    .with_prompt(format!(
                        "Move {} duplicate files in {} groups to Trash for user {}?",
                        plan.trash_ids.len(),
                        selected.len(),
                        session.user_id
                    ))
                    .default(false)
                    .interact_on(&Term::stderr())?;
                ensure!(accepted, "cancelled");
            }
            let file_refs: Vec<_> = entries.iter().map(|(file, _)| file).collect();
            dedup::remove_duplicates(session, &selected, &albums, &file_refs).await
                .context("duplicate removal did not finish; some changes may have succeeded; run photos duplicates online before retrying")?;
            replica.sync_collections(session).await
                .context("duplicates moved to Trash, but refreshing local album data failed; run photos duplicates online")?;
            let current_albums = replica.collections(None, None, |rows| {
                let mut albums = Vec::new();
                for row in rows {
                    let entry = row?;
                    let album = entry.value?;
                    if album.owner_id == session.user_id {
                        albums.push(album);
                    }
                }
                Ok(albums)
            })?;
            replica.sync_files(session, &current_albums).await
                .context("duplicates moved to Trash, but refreshing local file data failed; run photos duplicates online")?;
        }
        return output::action(
            options.json,
            &json!({"movedToTrash": plan.trash_ids.iter().map(i64::to_string).collect::<Vec<_>>()}),
            &format!("Moved {} duplicate files to Trash.", plan.trash_ids.len()),
        );
    }
    output::list(
        groups.into_iter().map(|group| {
            Ok(Group {
                size_bytes: group.item_size,
                files: group
                    .items
                    .into_iter()
                    .map(|item| File {
                        id: files[item.file_index].id.to_string(),
                        name: names[item.file_index].to_owned(),
                        album_ids: item.collection_ids.iter().map(i64::to_string).collect(),
                    })
                    .collect(),
            })
        }),
        &args.list,
        options.json,
        ["FILE IDS", "NAMES", "SIZE"],
        "No duplicates.",
        |group| {
            [
                group
                    .files
                    .iter()
                    .map(|file| file.id.as_str())
                    .collect::<Vec<_>>()
                    .join(","),
                group
                    .files
                    .iter()
                    .map(|file| output::escape_controls(&file.name))
                    .collect::<Vec<_>>()
                    .join(", "),
                group.size_bytes.to_string(),
            ]
        },
    )
}
