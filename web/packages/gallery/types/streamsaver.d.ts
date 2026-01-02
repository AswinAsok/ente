declare module "streamsaver" {
    interface StreamSaverOptions {
        size?: number;
        writableStrategy?: QueuingStrategy<Uint8Array>;
        readableStrategy?: QueuingStrategy<Uint8Array>;
    }

    interface StreamSaver {
        createWriteStream(
            name: string,
            options?: StreamSaverOptions,
        ): WritableStream<Uint8Array | BufferSource>;
        mitm?: string;
        WritableStream?: typeof WritableStream;
        supportsTransferable?: boolean;
    }

    const streamSaver: StreamSaver;
    export default streamSaver;
}
