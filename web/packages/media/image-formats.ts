import { lowercaseExtension } from "ente-base/file-name";

export interface ImageConversionFormat {
    decoder: string;
    mimeType: string;
    raw?: boolean;
}

// An extension selects a decoder, not permission to upload arbitrary bytes.
// Previously unrecognized files must also pass that decoder's image read.
const imageConversionFormats: Record<string, ImageConversionFormat> = {
    cr2: { decoder: "CR2", mimeType: "image/x-canon-cr2", raw: true },
    dng: { decoder: "DNG", mimeType: "image/x-adobe-dng", raw: true },
    erf: { decoder: "ERF", mimeType: "image/x-epson-erf", raw: true },
    nef: { decoder: "NEF", mimeType: "image/x-nikon-nef", raw: true },
    nrw: { decoder: "NRW", mimeType: "image/x-nikon-nrw", raw: true },
    orf: { decoder: "ORF", mimeType: "image/x-olympus-orf", raw: true },
    pef: { decoder: "PEF", mimeType: "image/x-pentax-pef", raw: true },
    raf: { decoder: "RAF", mimeType: "image/x-fuji-raf", raw: true },
    rw2: { decoder: "RW2", mimeType: "image/x-panasonic-rw2", raw: true },
    dds: { decoder: "DDS", mimeType: "image/vnd-ms.dds" },
    exr: { decoder: "EXR", mimeType: "image/x-exr" },
    fits: { decoder: "FITS", mimeType: "image/fits" },
    fts: { decoder: "FITS", mimeType: "image/fits" },
    hdr: { decoder: "HDR", mimeType: "image/vnd.radiance" },
    jp2: { decoder: "JP2", mimeType: "image/jp2" },
    mng: { decoder: "MNG", mimeType: "image/x-mng" },
    pam: { decoder: "PAM", mimeType: "image/x-portable-arbitrarymap" },
    pbm: { decoder: "PBM", mimeType: "image/x-portable-bitmap" },
    pcx: { decoder: "PCX", mimeType: "image/x-pcx" },
    pfm: { decoder: "PFM", mimeType: "image/x-portable-floatmap" },
    pgm: { decoder: "PGM", mimeType: "image/x-portable-graymap" },
    picon: { decoder: "XPM", mimeType: "image/x-xpixmap" },
    pict: { decoder: "PICT", mimeType: "image/x-pict" },
    pnm: { decoder: "PNM", mimeType: "image/x-portable-anymap" },
    ppm: { decoder: "PPM", mimeType: "image/x-portable-pixmap" },
    psd: { decoder: "PSD", mimeType: "image/vnd.adobe.photoshop" },
    ras: { decoder: "RAS", mimeType: "image/x-cmu-raster" },
    sgi: { decoder: "SGI", mimeType: "image/sgi" },
    tga: { decoder: "TGA", mimeType: "image/x-tga" },
    tif: { decoder: "TIFF", mimeType: "image/tiff" },
    tiff: { decoder: "TIFF", mimeType: "image/tiff" },
    wbmp: { decoder: "WBMP", mimeType: "image/vnd.wap.wbmp" },
    xbm: { decoder: "XBM", mimeType: "image/x-xbitmap" },
    xpm: { decoder: "XPM", mimeType: "image/x-xpixmap" },
    xwd: { decoder: "XWD", mimeType: "image/x-xwindowdump" },
};

export const imageConversionFormat = (
    fileName: string,
    detectedExtension?: string,
) => {
    const extension = lowercaseExtension(fileName) ?? "";
    // Trust a recognized browser format over a misleading filename. TGA is
    // the exception: its header can be mistaken for a Windows cursor.
    if (
        detectedExtension &&
        !Object.hasOwn(imageConversionFormats, detectedExtension) &&
        !(extension == "tga" && detectedExtension == "cur")
    )
        return undefined;
    return Object.hasOwn(imageConversionFormats, extension)
        ? imageConversionFormats[extension]
        : undefined;
};

export const maxImageConversionBytes = 100 * 1024 * 1024;
export const maxImageConversionPixels = 100_000_000;
export const imageConversionTimeout = 60_000;
export const maxImageThumbnailDimension = 720;
export const maxImageThumbnailBytes = 100 * 1024;

export type ImageConversionMode = "thumbnail" | "view";

export interface ConvertedImage {
    blob: Blob;
    sourceWidth: number;
    sourceHeight: number;
}
