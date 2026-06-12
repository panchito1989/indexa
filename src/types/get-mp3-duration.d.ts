// get-mp3-duration no trae tipos: mide la duración (ms) de un buffer MP3.
declare module "get-mp3-duration" {
  export default function getMP3Duration(buffer: Buffer): number;
}
