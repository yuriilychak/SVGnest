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
    getButtonConfig(BUTTON_ACTIONS.OPEN_FAQ, QuestionMarkIcon, 'FAQ')
]

const getHelpContent = (title: string, content: string, url: string = '', mask: string = '') => ({ title, content, url, mask })

export const HELP_CONTENT_CONFIG = [
    getHelpContent(
        "What exactly is 'nesting'?",
        "If you have some parts to cut out of a piece of metal/plastic/wood etc, you'd want to arrange the parts to use as little material as possible. This is a common problem if you use a laser cutter, plasma cutter, or CNC machine.In computer terms this is called the irregular bin-packing problem."
    ),
    getHelpContent(
        'How much does it cost?',
        "It's free and open source. The code and implementation details are on",
        'https://github.com/Jack000/SVGnest',
        'Github'
    ),
    getHelpContent(
        'Does it use inches? mm?',
        "SVG has its internal units, the distance related fields in the settings use SVG units, ie. pixels. The conversion between a pixel and real units depend on the exporting software, but it's typically 72 pixels = 1 inch."
    ),
    getHelpContent(
        "My SVG text/image doesn't show up?",
        "Nesting only works for closed shapes, so SVG elements that don't represent closed shapes are removed. Convert text and any other elements to outlines first. Ensure that outlines do not intersect or overlap eachother. Outlines that are inside other outlines are considered holes."
    ),
    getHelpContent(
        "It doesn't ever stop?",
        'The software will continuously look for better solutions until you press the stop button. You can stop at any time and download the SVG file.'
    ),
    getHelpContent(
        'Some parts seem to slightly overlap?',
        'Curved shapes are approximated with line segments. For a more accurate nest with curved parts, decrease the curve tolerance parameter in the configuration.'
    ),
    getHelpContent('I need help?', 'Add an issue on Github or contact me personally:', 'http://jack.works', 'jack.works')
]

export const STYLES = {
    root: {
        width: '100vw',
        height: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        gap: { xs: 0.5, sm: 1 },
        paddingX: { xs: 1, sm: 2 },
        boxSizing: 'border-box'
    },
    title: { typography: { md: 'h4', xs: 'h5' } },
    subtitle: { typography: { md: 'h5', xs: 'body1' } }
}
