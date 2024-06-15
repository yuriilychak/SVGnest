import createTheme from '@mui/material/styles/createTheme';

const THEME = createTheme({
    components: {
        MuiIconButton: {
            styleOverrides: {
                root: {
                    border: '1px solid rgba(59, 179, 74, 0.5)',
                    color: '#3bb34a'
                }
            }
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 20,
                    textTransform: 'none',
                    fontSize: '0.7rem',
                    display: 'flex',
                    alignItems: 'center'
                }
            }
        }
    },
    typography: {
        fontFamily: 'LatoLatinWeb, helveti',
        h4: {
            color: '#3bb34a'
        },
        h5: {
            color: '#3bb34a'
        },
        body1: {
            color: '#3bb34a'
        }
    },
    palette: {
        primary: {
            main: '#3bb34a',
            contrastText: '#ffffff'
        },
        secondary: {
            main: '#f50057'
        },
        text: {
            primary: '#3bb34a',
            secondary: '#8b8b8b'
        }
    }
});

export default THEME;
