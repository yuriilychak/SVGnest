export enum BUTTON_ACTIONS {
    START = 'start',
    UPLOAD = 'upload',
    DOWNLOAD = 'download',
    SETTINGS = 'settings',
    ZOOM_IN = 'zoomIn',
    ZOOM_OUT = 'zoomOut',
    BACK = 'back'
}

export interface AppFlowProps {
    onClose(): void
}
