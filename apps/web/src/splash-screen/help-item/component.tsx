import { FC } from 'react';
import { useTranslation } from 'react-i18next';

import './styles.scss';

interface HelpItemProps {
    id: string;
    url: string;
    mask: string;
    t(key: string): string;
}

const HelpItem: FC<HelpItemProps> = ({ id, url, mask, t }) => (
    <div className="helpItemRoot">
        <p className="helpItemTitle">{t(`splashScreen.helpDrawer.item.${id}.title`)}</p>
        <p className="helpItemText">
            {t(`splashScreen.helpDrawer.item.${id}.description`)}
            {url && (
                <a href={url} className="helperItemLink" target="_blank">
                    {mask}
                </a>
            )}
        </p>
    </div>
);

export default HelpItem;
