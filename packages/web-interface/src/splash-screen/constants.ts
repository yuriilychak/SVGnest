import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import FlagIcon from '@mui/icons-material/Flag';
import GitHubIcon from '@mui/icons-material/GitHub';
import QuestionMarkIcon from '@mui/icons-material/QuestionMark';

import { BUTTON_ACTION } from './types';
import { ButtonConfig, getButtonConfig } from '../shared';

export const BUTTON_CONFIG: ButtonConfig[] = [
    getButtonConfig(BUTTON_ACTION.DEMO, PlayArrowIcon),
    getButtonConfig(BUTTON_ACTION.START, FlagIcon),
    getButtonConfig(BUTTON_ACTION.GITHUB, GitHubIcon),
    getButtonConfig(BUTTON_ACTION.OPEN_FAQ, QuestionMarkIcon)
];

const getHelpContent = (id: string, url: string = '', mask: string = '') => ({
    id,
    url,
    mask
});

export const HELP_CONTENT_CONFIG = [
    getHelpContent('nesting'),
    getHelpContent('cost', 'https://github.com/Jack000/SVGnest', 'Github'),
    getHelpContent('mesure'),
    getHelpContent('svg'),
    getHelpContent('stop'),
    getHelpContent('overlap'),
    getHelpContent('help', 'http://jack.works', 'jack.works')
];

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
};
