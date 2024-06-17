import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import SettingsIcon from '@mui/icons-material/Settings'
import FileUpload from '@mui/icons-material/FileUpload'
import ZoomInIcon from '@mui/icons-material/ZoomIn'
import ZoomOutIcon from '@mui/icons-material/ZoomOut'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'

import { ButtonConfig, getButtonConfig } from '../shared'
import { BUTTON_ACTIONS } from './types'

export const DESKTOP_BUTTON_CONFIG: ButtonConfig[] = [
    getButtonConfig(BUTTON_ACTIONS.START, PlayArrowIcon, 'Start Nest'),
    getButtonConfig(BUTTON_ACTIONS.UPLOAD, FileUpload, 'Upload SVG'),
    getButtonConfig(BUTTON_ACTIONS.DOWNLOAD, FileDownloadIcon, 'Download SVG'),
    getButtonConfig(BUTTON_ACTIONS.ZOOM_IN, ZoomInIcon),
    getButtonConfig(BUTTON_ACTIONS.ZOOM_OUT, ZoomOutIcon),
    getButtonConfig(BUTTON_ACTIONS.SETTINGS, SettingsIcon),
    getButtonConfig(BUTTON_ACTIONS.BACK, ArrowBackIcon)
]
