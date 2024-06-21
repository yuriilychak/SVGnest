import { FC, memo } from 'react'

import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

interface MesureItemProps {
    label: string
    value: string
}

const MesureItem: FC<MesureItemProps> = ({ label, value }) => (
    <Stack direction='column' alignItems='center'>
        <Typography variant='caption' component='div' color='text.primary'>
            {label}
        </Typography>
        <Typography variant='body1' component='div' color='text.primary'>
            {value}
        </Typography>
    </Stack>
)

export default memo(MesureItem)
