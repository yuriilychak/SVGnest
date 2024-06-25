export const GLOBAL_STYLES = {
    '#app': {
        width: '100vw',
        height: '100vh'
    },
    '#exportRoot': {
        fill: '#ffffff !important',
        fillOpacity: '1 !important',
        stroke: '#8498d1 !important'
    },
    '#exportContent': {
        'fill': '#8498d1 !important',
        'fillOpacity': '1 !important',
        'stroke': '#617bb5 !important',
        'strokeWidth': '2px !important',
        'vectorEffect': 'non-scaling-stroke !important',
        'strokeLinejoin': 'round !important',
        '& *': {
            fill: '#8498d1 !important',
            fillOpacity: '1 !important',
            stroke: '#617bb5 !important',
            strokeWidth: '2px !important',
            vectorEffect: 'non-scaling-stroke !important',
            strokeLinejoin: 'round !important'
        }
    },
    '@font-face': {
        fontFamily: 'LatoLatinWeb',
        src: 'url(\'assets/LatoLatin-Regular.woff2\') format(\'woff2\')',
        fontStyle: 'normal',
        fontWeight: 'normal',
        textRendering: 'optimizeLegibility'
    },
    'body': { margin: 0, scrollbarColor: '#3bb34a #ffffff', scrollbarWidth: 'thin' }
};
