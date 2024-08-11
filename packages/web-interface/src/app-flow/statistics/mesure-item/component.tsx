import { FC, memo } from 'react';

import './styles.scss';

interface MesureItemProps {
    label: string;
    value: string;
}

const MesureItem: FC<MesureItemProps> = ({ label, value }) => (
    <div className="mesureRoot flexCenter">
        <span className="mesureTitle">{label}</span>
        <span className="mesureValue">{value}</span>
    </div>
);

export default memo(MesureItem);
