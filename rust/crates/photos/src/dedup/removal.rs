use std::collections::HashMap;

use ente_core::{Session, b64, crypto::secretbox, http};
use serde_json::json;

use super::{Duplicate, RemovalPlan, plan_removal};
use crate::{collections::Collection, files::File};

#[derive(Debug, thiserror::Error)]
pub enum RemovalError {
    #[error("invalid duplicate removal input: {0}")]
    InvalidInput(&'static str),
    #[error(transparent)]
    Http(#[from] http::Error),
}

pub async fn remove_duplicates(
    session: &Session,
    groups: &[Vec<Duplicate>],
    collections: &[Collection],
    files: &[&File],
) -> Result<RemovalPlan, RemovalError> {
    let plan = plan_removal(groups);
    let collections: HashMap<_, _> = collections.iter().map(|c| (c.id, c)).collect();
    let files: HashMap<_, _> = files.iter().map(|f| (f.id, *f)).collect();
    let mut memberships = HashMap::new();
    for group in groups {
        for item in group {
            let file = files
                .get(&item.file_id)
                .ok_or(RemovalError::InvalidInput("missing file"))?;
            if file.owner_id != session.user_id || item.collection_ids.is_empty() {
                return Err(RemovalError::InvalidInput(
                    "file is not owned or has no album",
                ));
            }
            for id in &item.collection_ids {
                let album = collections
                    .get(id)
                    .ok_or(RemovalError::InvalidInput("missing album"))?;
                if album.owner_id != session.user_id {
                    return Err(RemovalError::InvalidInput("album is not owned"));
                }
            }
            memberships.insert(item.file_id, item.collection_ids[0]);
        }
    }
    let additions: Vec<_> = plan
        .additions
        .iter()
        .map(|addition| {
            let album = collections[&addition.collection_id];
            let items: Vec<_> = addition
                .file_ids
                .iter()
                .map(|id| {
                    let encrypted = secretbox::encrypt(files[id].key.as_bytes(), &album.key);
                    json!({"id": id, "encryptedKey": b64::encode(&encrypted.encrypted_data),
                "keyDecryptionNonce": b64::encode(encrypted.nonce.as_bytes())})
                })
                .collect();
            (album.id, items)
        })
        .collect();
    let trash: Vec<_> = plan
        .trash_ids
        .iter()
        .map(|id| json!({"fileID": id, "collectionID": memberships[id]}))
        .collect();
    for (collection_id, files) in additions {
        for batch in files.chunks(1000) {
            session
                .api
                .post("/collections/add-files")
                .json(&json!({"collectionID": collection_id, "files": batch}))
                .send()
                .await?
                .error_for_code()
                .await?;
        }
    }
    for batch in trash.chunks(1000) {
        session
            .api
            .post("/files/trash")
            .json(&json!({"items": batch}))
            .send()
            .await?
            .error_for_code()
            .await?;
    }
    Ok(plan)
}
