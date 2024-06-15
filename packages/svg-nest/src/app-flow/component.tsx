import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import SettingsIcon from '@mui/icons-material/Settings';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

const AppFlow = ({ onClose }: { onClose: () => void }) =>
    <Stack width="100vw" height="100vh" padding={2} boxSizing="border-box">
        <Box overflow="auto" width="100%" paddingBottom={1} boxSizing="border-box">
            <Stack direction="row" gap={{ xs: 1, sm: 2 }} width="max-content">
                <Button variant="outlined" startIcon={<PlayArrowIcon />}>
                    Start Nest
                </Button>
                <Button variant="outlined" startIcon={<FileDownloadIcon />}>
                    Download SVG
                </Button>
                <IconButton>
                    <SettingsIcon fontSize="small" />
                </IconButton>
                <IconButton>
                    <ZoomInIcon fontSize="small" />
                </IconButton>
                <IconButton>
                    <ZoomOutIcon fontSize="small" />
                </IconButton>
                <IconButton onClick={onClose}>
                    <ArrowBackIcon fontSize="small" />
                </IconButton>
            </Stack>
        </Box>
        <Box flex={1} paddingTop={1} boxSizing="border-box">
            Content
        </Box>
    </Stack>;


export default AppFlow;
