import { BUTTON_ACTION } from '../types';

export const BUTTON_CONFIG: BUTTON_ACTION[] = [
    BUTTON_ACTION.DEMO,
    BUTTON_ACTION.OPEN,
    BUTTON_ACTION.CODE,
    BUTTON_ACTION.OPEN_FAQ
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
