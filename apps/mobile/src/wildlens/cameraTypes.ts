export type CameraPhoto = { uri: string; width: number; height: number };
export type CameraCaptureProps = { onCapture: (photo: CameraPhoto) => void; onClose: () => void };
