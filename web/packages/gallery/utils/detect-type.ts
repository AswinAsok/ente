import { isNamedError, namedError } from "ente-base/error";
import { lowercaseExtension } from "ente-base/file-name";
import {
    FileType,
    KnownFileTypeInfos,
    KnownNonMediaFileExtensions,
    type FileTypeInfo,
} from "ente-media/file-type";
import { imageConversionFormat } from "ente-media/image-formats";
import { fileTypeFromBuffer } from "file-type";

export const detectFileTypeInfo = async (file: File): Promise<FileTypeInfo> =>
    detectFileTypeInfoFromChunk(() => readInitialChunkOfFile(file), file.name);

export const detectFileTypeInfoFromChunk = async (
    readInitialChunk: () => Promise<Uint8Array | undefined>,
    fileNameOrPath: string,
    validateImage?: () => Promise<void>,
): Promise<FileTypeInfo> => {
    const extension = lowercaseExtension(fileNameOrPath);
    const conversion = imageConversionFormat(fileNameOrPath);
    const initialChunk = await readInitialChunk();
    let detected: FileTypeInfo | undefined;
    let detectionError: unknown;
    try {
        const { ext, mime } = await detectFileTypeFromBuffer(initialChunk!);
        const fileType = mime.startsWith("image/")
            ? FileType.image
            : mime.startsWith("video/")
              ? FileType.video
              : undefined;
        if (fileType === undefined)
            throw fileTypeNotSupportedError(
                `Unsupported file format (MIME type ${mime})`,
            );
        detected = { fileType, extension: ext, mimeType: mime };
    } catch (e) {
        detectionError = e;
    }

    // A TGA header can match the cursor signature. All other recognized
    // signatures take precedence over the filename, including renamed JPEGs.
    const ambiguousTGA = extension == "tga" && detected?.extension == "cur";
    if (detected && !(ambiguousTGA && validateImage)) return detected;

    if (conversion && validateImage) {
        await validateImage();
        return {
            fileType: FileType.image,
            extension: extension!,
            mimeType: conversion.mimeType,
        };
    }
    const known = KnownFileTypeInfos.find((f) => f.extension == extension);
    if (known) return known;

    if (
        extension &&
        (KnownNonMediaFileExtensions.includes(extension) ||
            extension == "pes" ||
            extension == "erf")
    )
        throw fileTypeNotSupportedError(
            `Unsupported file format (extension ${extension})`,
            { cause: detectionError },
        );

    throw detectionError;
};

export const isFileTypeNotSupportedError = (e: unknown) =>
    isNamedError(e, "file_type_not_supported");

const fileTypeNotSupportedError = (message: string, options?: ErrorOptions) =>
    namedError("file_type_not_supported", message, options);

const readInitialChunkOfFile = async (file: File) => {
    const chunkSizeForTypeDetection = 4100;
    const chunk = file.slice(0, chunkSizeForTypeDetection);
    return new Uint8Array(await chunk.arrayBuffer());
};

const detectFileTypeFromBuffer = async (buffer: Uint8Array) => {
    const result = await fileTypeFromBuffer(buffer);
    if (!result)
        throw Error("Could not deduce file type from the file's contents");
    return result;
};
