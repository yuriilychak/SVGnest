import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

const HelpItem = ({ title, children }: { title: string; children: string | JSX.Element | JSX.Element[] }) =>
    <Stack gap={0.5} width="100%">
        <Typography sx={{ typography: { md: 'body1', xs: 'body2' } }}>{title}</Typography>
        <Typography sx={{ typography: { md: 'body2', xs: 'caption' } }} color="text.secondary">
            {children}
        </Typography>
    </Stack>;


export default HelpItem;
