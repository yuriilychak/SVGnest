export enum BUTTON_ACTION {
    DEMO = 'demo',
    START = 'start',
    GITHUB = 'github',
    OPEN_FAQ = 'openFaq',
    CLOSE_FAQ = 'closeFaq'
}

export interface SplashScreenProps {
    onOpenApp(isLoadFile: boolean): void;
}
