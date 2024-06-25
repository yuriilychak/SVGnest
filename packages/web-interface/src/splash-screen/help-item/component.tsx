import { FC } from 'react';
import { useTranslation } from 'react-i18next';

import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Link from '@mui/material/Link';

interface HelpItemProps {
    id: string;
    url: string;
    mask: string;
}

const HelpItem: FC<HelpItemProps> = ({ id, url, mask }) => {
    const { t } = useTranslation();

    return (
        <Stack gap={0.5} width="100%">
            <Typography sx={{ typography: { md: 'body1', xs: 'body2' } }}>
                {t(`splashScreen.helpDrawer.item.${id}.title`)}
            </Typography>
            <Typography sx={{ typography: { md: 'body2', xs: 'caption' }, textAlign: 'justify' }} color="text.secondary">
                {t(`splashScreen.helpDrawer.item.${id}.description`)}
                {url &&
                    <Link href={url} sx={{ paddingLeft: { xs: 0.5, sm: 1 } }} target="_blank">
                        {mask}
                    </Link>
                }
            </Typography>
        </Stack>
    );
};

export default HelpItem;
