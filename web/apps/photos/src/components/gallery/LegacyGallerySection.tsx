import { CreateAlbumDialog } from "@/components/collections/CreateAlbumDialog";
import { useModalVisibility } from "ente-base/components/utils/modal";
import { useState, type ReactNode } from "react";
import type { RemotePullOpts } from ".";
import {
    GalleryBarImpl,
    type GalleryBarImplProps,
    type GalleryBarPresentationProps,
} from "./BarImpl";
import {
    GallerySectionLayout,
    type GallerySectionPresentation,
} from "./GallerySectionLayout";
import { usePhotosNavigation } from "./PhotosNavigationContext";
import type { GalleryBarMode } from "./reducer";

export type LegacyGalleryNavigation = Omit<
    GalleryBarImplProps,
    keyof GalleryBarPresentationProps | "mode" | "onCreateAlbum"
> & { onRemotePull: (opts?: RemotePullOpts) => Promise<void> };

export const LegacyGallerySection = ({
    navigation,
    mode,
    presentation,
    fullBleed,
    children,
}: {
    navigation: LegacyGalleryNavigation | undefined;
    mode: GalleryBarMode;
    presentation: GallerySectionPresentation;
    fullBleed: boolean;
    children: ReactNode;
}) => {
    const { selectCollection } = usePhotosNavigation();
    const { show, props } = useModalVisibility();
    const [isHidden, setIsHidden] = useState(false);
    return (
        <GallerySectionLayout
            presentation={presentation}
            fullBleed={fullBleed}
            navigation={
                navigation && (
                    <GalleryBarImpl
                        {...navigation}
                        {...presentation}
                        mode={mode}
                        onCreateAlbum={() => {
                            setIsHidden(mode == "hidden-albums");
                            show();
                        }}
                    />
                )
            }
        >
            {children}
            {navigation && (
                <CreateAlbumDialog
                    {...props}
                    isHidden={isHidden}
                    onRemotePull={navigation.onRemotePull}
                    onSelectCollectionID={(id) => {
                        selectCollection(id);
                        presentation.mobileDrawerProps.onClose();
                    }}
                />
            )}
        </GallerySectionLayout>
    );
};
