import { memo } from 'react'

import Box from '@mui/material/Box'

import { PATH_CONFIG } from './constants'

const Logo = () => (
    <Box sx={{ minWidth: { xs: '40vw', sm: 'unset' }, maxWidth: { xs: 128, sm: 196, md: 256 } }}>
        <svg version='1.1' width='100%' viewBox='0 0 200 200'>
            {PATH_CONFIG.map((config, index) => (
                <path {...config} key={`path${index}`} />
            ))}
        </svg>
    </Box>
)

export default memo(Logo)
