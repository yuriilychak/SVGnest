export const ANIMATION_CONFIG = new Map([
    [true, { key1: 'visible', key2: 'animating', duration: 10 }],
    [false, { key1: 'animating', key2: 'visible', duration: 300 }]
]);

export const ANIMATION_CLASSES = new Map([
    [true, { fade: 'fadeIn', drawer: 'drawerOpen' }],
    [false, { fade: 'fadeOut', drawer: 'drawerClose' }]
]);

export const INITIAL_STATE = { visible: false, animating: false };
