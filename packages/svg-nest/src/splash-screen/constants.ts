import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import FlagIcon from '@mui/icons-material/Flag'
import GitHubIcon from '@mui/icons-material/GitHub'
import QuestionMarkIcon from '@mui/icons-material/QuestionMark'

import { BUTTON_ACTIONS } from './types'
import { ButtonConfig, getButtonConfig } from '../shared'

export const BUTTON_CONFIG: ButtonConfig[] = [
    getButtonConfig(BUTTON_ACTIONS.DEMO, PlayArrowIcon, 'Demo'),
    getButtonConfig(BUTTON_ACTIONS.START, FlagIcon, 'Start'),
    getButtonConfig(BUTTON_ACTIONS.GITHUB, GitHubIcon, 'Github'),
    getButtonConfig(BUTTON_ACTIONS.FAQ, QuestionMarkIcon, 'FAQ')
]
