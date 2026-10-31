import type { FileListWithViewerProps } from "@/components/FileListWithViewer";
import type { UploadTypeSelectorIntent } from "ente-gallery/components/Upload";
import type { useSaveGroups } from "ente-gallery/components/utils/save-groups";
import type { Collection } from "ente-media/collection";
import type { EnteFile } from "ente-media/file";
import type { Dispatch, SetStateAction } from "react";
import type { GallerySectionPresentation } from "./GallerySectionLayout";
import type { useGalleryPreferences } from "./hooks/use-gallery-preferences";
import type { GalleryNavigationState } from "./navigation-state";
import type { GalleryState } from "./reducer";

export type GalleryMediaSource = Pick<
    FileListWithViewerProps,
    | "mode"
    | "modePlus"
    | "files"
    | "activeCollectionID"
    | "activeCollectionSummary"
    | "activePersonID"
    | "disableGrouping"
> & { activeCollection?: Collection | undefined };

export type GallerySectionOperations = Pick<
    FileListWithViewerProps,
    | "selected"
    | "setSelected"
    | "onContextMenuAction"
    | "onContextMenuOpenChange"
    | "suppressSelectionUI"
    | "showAddPersonAction"
    | "onAddSaveGroup"
    | "onFileVisibilityUpdate"
    | "onMarkTempDeleted"
    | "onSetOpenFileViewer"
    | "onRemotePull"
    | "onVisualFeedback"
    | "onAddFileToCollection"
    | "onPendingNavigationConsumed"
> & {
    onRemoteFilesPull: () => Promise<void>;
    mediaSource: GalleryMediaSource | undefined;
    setMediaSource: Dispatch<SetStateAction<GalleryMediaSource | undefined>>;
    onToggleFavorite: (file: EnteFile) => Promise<void>;
    onSendLink: (file: EnteFile) => Promise<void>;
    setBlockingLoad: Dispatch<SetStateAction<boolean>>;
    onUpload: (intent?: UploadTypeSelectorIntent) => void;
    onCreateAlbum: () => void;
    saveGroups: ReturnType<typeof useSaveGroups>["saveGroups"];
    setSectionActivity: Dispatch<
        SetStateAction<{ selection: boolean; drop: boolean }>
    >;
};

export interface GallerySectionProps {
    library: Readonly<GalleryState> & {
        isFirstLoad: boolean;
        searchIndexRevision: number;
    };
    operations: GallerySectionOperations;
    navigation: GalleryNavigationState & {
        pendingFileNavigation:
            | {
                  fileIndex: number;
                  sidebar?: FileListWithViewerProps["pendingFileSidebar"];
                  commentID?: string;
              }
            | undefined;
        retainPerson: (
            personID: string | undefined,
            extraVisiblePersonID: string | undefined,
        ) => void;
    };
    preferences: ReturnType<typeof useGalleryPreferences>;
    presentation: GallerySectionPresentation;
}
