import { useCallback, useState, useMemo, memo, FC } from 'react';
import { useTranslation } from 'react-i18next';

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

import { HelpItem } from './help-item';
import { ButtonGroup, SharedDrawer } from '../shared';
import { BUTTON_CONFIG, HELP_CONTENT_CONFIG, STYLES } from './constants';
import { BUTTON_ACTION, SplashScreenProps } from './types';

const SplashScreen: FC<SplashScreenProps> = ({ onOpenApp }) => {
    const { t } = useTranslation();
    const [isDrawerOpen, setDrawerOpen] = useState(false);
    const helpContent = useMemo(() => HELP_CONTENT_CONFIG.map(config => <HelpItem {...config} key={config.id} />), []);

    const handleAction = useCallback(
        (action: string) => {
            switch (action as BUTTON_ACTION) {
                case BUTTON_ACTION.DEMO:
                case BUTTON_ACTION.START:
                    onOpenApp((action as BUTTON_ACTION) === BUTTON_ACTION.DEMO);
                    break;
                case BUTTON_ACTION.GITHUB:
                    window.open('https://github.com/Jack000/SVGnest', '_blank');
                    break;
                default:
                    setDrawerOpen((action as BUTTON_ACTION) === BUTTON_ACTION.OPEN_FAQ);
            }
        },
        [onOpenApp]
    );

    return (
        <Stack sx={STYLES.root}>
            <Box
                sx={{ minWidth: { xs: '40vw', sm: 'unset' }, maxWidth: { xs: 128, sm: 196, md: 256 } }}
                component="img"
                src={`${window.location.origin}/assets/logo.svg`}
            />
            <Typography sx={STYLES.title}>{t('splashScreen.title')}</Typography>
            <Typography sx={STYLES.subtitle}>{t('splashScreen.subtitle')}</Typography>
            <ButtonGroup buttonsConfig={BUTTON_CONFIG} onClick={handleAction} localePrefix="splashScreen.buttons" />
            <SharedDrawer
                isOpen={isDrawerOpen}
                onClose={handleAction}
                closeAction={BUTTON_ACTION.CLOSE_FAQ}
                title={t('splashScreen.helpDrawer.title')}
            >
                {helpContent}
            </SharedDrawer>
        </Stack>
    );
};

export default memo(SplashScreen);
