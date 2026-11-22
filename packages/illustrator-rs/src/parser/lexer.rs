use crate::error::{Error, Result};

const MAX_TOKEN_COUNT: usize = 10_000_000;
const PSEUDO_COMMENT_PREFIXES: &[&str] = &["%_", "%AI"];

#[derive(Debug, Clone, PartialEq)]
pub enum TokenType {
    Number,
    String,
    Operator,
    Comment,
    PseudoComment,
    ArrayStart,
    ArrayEnd,
    Name,
    Eof,
}

#[derive(Debug, Clone)]
pub struct Token {
    pub token_type: TokenType,
    pub value: String,
    pub line: usize,
    pub col: usize,
}

pub struct Lexer {
    source: String,
    pos: usize,
    length: usize,
    line: usize,
    col: usize,
}

impl Lexer {
    pub fn new(source: &str) -> Self {
        Lexer {
            source: source.to_string(),
            pos: 0,
            length: source.len(),
            line: 1,
            col: 1,
        }
    }

    fn peek(&self) -> Option<char> {
        if self.pos < self.length {
            self.source[self.pos..].chars().next()
        } else {
            None
        }
    }

    fn advance(&mut self) -> Option<char> {
        if self.pos < self.length {
            let ch = self.source[self.pos..].chars().next().unwrap();
            self.pos += ch.len_utf8();
            if ch == '\n' {
                self.line += 1;
                self.col = 1;
            } else {
                self.col += 1;
            }
            Some(ch)
        } else {
            None
        }
    }

    fn skip_whitespace(&mut self) {
        while self.pos < self.length {
            let ch = self.peek().unwrap();
            if ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n' || ch == '\x00' || ch == '\x0c' {
                self.advance();
            } else {
                break;
            }
        }
    }

    fn read_number(&mut self) -> Token {
        let line = self.line;
        let col = self.col;
        let start = self.pos;
        if let Some(ch) = self.peek()
            && (ch == '-' || ch == '+') {
                self.advance();
            }
        let mut has_dot = false;
        while self.pos < self.length {
            let ch = self.peek().unwrap();
            if ch == '.' && !has_dot {
                has_dot = true;
                self.advance();
            } else if ch.is_ascii_digit() {
                self.advance();
            } else {
                break;
            }
        }
        let text = self.source[start..self.pos].to_string();
        Token {
            token_type: TokenType::Number,
            value: text,
            line,
            col,
        }
    }

    fn read_string(&mut self) -> Token {
        let line = self.line;
        let col = self.col;
        self.advance();
        let mut result = String::new();
        let mut depth = 1;
        while self.pos < self.length && depth > 0 {
            let ch = self.advance().unwrap();
            if ch == '\\' {
                if let Some(esc) = self.advance() {
                    match esc {
                        'n' => result.push('\n'),
                        'r' => result.push('\r'),
                        't' => result.push('\t'),
                        '\\' => result.push('\\'),
                        '(' => result.push('('),
                        ')' => result.push(')'),
                        '0'..='7' => {
                            let mut octal = String::from(esc);
                            for _ in 0..2 {
                                if self.pos < self.length {
                                    let next = self.peek().unwrap();
                                    if next.is_ascii_digit() && next <= '7' {
                                        octal.push(self.advance().unwrap());
                                    } else {
                                        break;
                                    }
                                }
                            }
                            let code = u32::from_str_radix(&octal, 8).unwrap_or(0);
                            if let Some(c) = char::from_u32(code) {
                                result.push(c);
                            }
                        }
                        c => result.push(c),
                    }
                }
            } else if ch == '(' {
                depth += 1;
                result.push(ch);
            } else if ch == ')' {
                depth -= 1;
                if depth > 0 {
                    result.push(ch);
                }
            } else {
                result.push(ch);
            }
        }
        Token {
            token_type: TokenType::String,
            value: result,
            line,
            col,
        }
    }

    fn read_hex_string(&mut self) -> Token {
        let line = self.line;
        let col = self.col;
        self.advance();
        let mut hex_chars = Vec::new();
        while self.pos < self.length {
            let ch = self.peek().unwrap();
            if ch == '>' {
                self.advance();
                break;
            } else if ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n' {
                self.advance();
                continue;
            } else if ch.is_ascii_hexdigit() {
                hex_chars.push(ch);
                self.advance();
            } else {
                self.advance();
            }
        }
        let hex_str: String = hex_chars.into_iter().collect();
        let value = if hex_str.len().is_multiple_of(2) {
            let bytes: Vec<u8> = hex_str
                .as_bytes()
                .chunks(2)
                .filter_map(|pair| {
                    let s = std::str::from_utf8(pair).ok()?;
                    u8::from_str_radix(s, 16).ok()
                })
                .collect();
            String::from_utf8_lossy(&bytes).to_string()
        } else {
            hex_str
        };
        Token {
            token_type: TokenType::String,
            value,
            line,
            col,
        }
    }

    fn read_name(&mut self) -> Token {
        let line = self.line;
        let col = self.col;
        self.advance();
        let start = self.pos;
        while self.pos < self.length {
            let ch = self.peek().unwrap();
            if ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n'
                || ch == '(' || ch == ')' || ch == '['
                || ch == ']' || ch == '{' || ch == '}'
                || ch == '/' || ch == '<' || ch == '>' || ch == '%'
            {
                break;
            }
            self.advance();
        }
        let text = self.source[start..self.pos].to_string();
        Token {
            token_type: TokenType::Name,
            value: text,
            line,
            col,
        }
    }

    fn read_comment(&mut self) -> Token {
        let line = self.line;
        let col = self.col;
        let start = self.pos;
        self.advance();
        while self.pos < self.length {
            let ch = self.peek().unwrap();
            if ch == '\r' || ch == '\n' {
                break;
            }
            self.advance();
        }
        let text = self.source[start..self.pos].to_string();
        let token_type = if PSEUDO_COMMENT_PREFIXES.iter().any(|p| text.starts_with(p)) {
            TokenType::PseudoComment
        } else {
            TokenType::Comment
        };
        Token {
            token_type,
            value: text,
            line,
            col,
        }
    }

    fn read_operator(&mut self) -> Token {
        let line = self.line;
        let col = self.col;
        let start = self.pos;
        while self.pos < self.length {
            let ch = self.peek().unwrap();
            if ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n'
                || ch == '(' || ch == ')' || ch == '['
                || ch == ']' || ch == '{' || ch == '}'
                || ch == '/' || ch == '<' || ch == '>' || ch == '%'
            {
                break;
            }
            self.advance();
        }
        if self.pos == start {
            self.advance();
        }
        let text = self.source[start..self.pos].to_string();
        Token {
            token_type: TokenType::Operator,
            value: text,
            line,
            col,
        }
    }

    fn tokenize_raw(&mut self) -> Result<Vec<Token>> {
        let mut tokens = Vec::new();
        while self.pos < self.length {
            self.skip_whitespace();
            if self.pos >= self.length {
                break;
            }

            let ch = self.peek().unwrap();
            let line = self.line;
            let col = self.col;

            match ch {
                '(' => tokens.push(self.read_string()),
                '/' => tokens.push(self.read_name()),
                '[' => {
                    self.advance();
                    tokens.push(Token {
                        token_type: TokenType::ArrayStart,
                        value: "[".to_string(),
                        line,
                        col,
                    });
                }
                ']' => {
                    self.advance();
                    tokens.push(Token {
                        token_type: TokenType::ArrayEnd,
                        value: "]".to_string(),
                        line,
                        col,
                    });
                }
                '%' => {
                    tokens.push(self.read_comment());
                }
                '-' | '+'
                    if self.pos + 1 < self.length => {
                        let source = &self.source;
                        let next_start = self.pos + 1;
                        let next = source[next_start..].chars().next();
                        if next.is_some()
                            && (next.unwrap().is_ascii_digit() || next.unwrap() == '.')
                        {
                            tokens.push(self.read_number());
                        } else {
                            tokens.push(self.read_operator());
                        }
                    }
                '0'..='9' => {
                    tokens.push(self.read_number());
                }
                '.'
                    if self.pos + 1 < self.length => {
                        let source = &self.source;
                        let next_start = self.pos + 1;
                        let next = source[next_start..].chars().next();
                        if next.is_some() && next.unwrap().is_ascii_digit() {
                            tokens.push(self.read_number());
                        } else {
                            tokens.push(self.read_operator());
                        }
                    }
                '<' => {
                    if self.pos + 1 < self.length {
                        let source = &self.source;
                        let next_start = self.pos + 1;
                        let next = source[next_start..].chars().next();
                        if next == Some('<') {
                            self.advance();
                            self.advance();
                            tokens.push(Token {
                                token_type: TokenType::Operator,
                                value: "<<".to_string(),
                                line,
                                col,
                            });
                        } else {
                            tokens.push(self.read_hex_string());
                        }
                    } else {
                        self.advance();
                    }
                }
                '>' => {
                    if self.pos + 1 < self.length {
                        let source = &self.source;
                        let next_start = self.pos + 1;
                        let next = source[next_start..].chars().next();
                        if next == Some('>') {
                            self.advance();
                            self.advance();
                            tokens.push(Token {
                                token_type: TokenType::Operator,
                                value: ">>".to_string(),
                                line,
                                col,
                            });
                        } else {
                            self.advance();
                        }
                    } else {
                        self.advance();
                    }
                }
                '{' => {
                    self.advance();
                    tokens.push(Token {
                        token_type: TokenType::Operator,
                        value: "{".to_string(),
                        line,
                        col,
                    });
                }
                '}' => {
                    self.advance();
                    tokens.push(Token {
                        token_type: TokenType::Operator,
                        value: "}".to_string(),
                        line,
                        col,
                    });
                }
                '*' => {
                    self.advance();
                    if self.pos < self.length {
                        let ch = self.peek().unwrap();
                        if ch != ' ' && ch != '\t' && ch != '\r' && ch != '\n'
                            && ch != '(' && ch != ')' && ch != '['
                            && ch != ']' && ch != '{' && ch != '}'
                            && ch != '/' && ch != '<' && ch != '>' && ch != '%'
                        {
                            let start = self.pos - 1;
                            while self.pos < self.length {
                                let ch = self.peek().unwrap();
                                if ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n'
                                    || ch == '(' || ch == ')' || ch == '['
                                    || ch == ']' || ch == '{' || ch == '}'
                                    || ch == '/' || ch == '<' || ch == '>' || ch == '%'
                                {
                                    break;
                                }
                                self.advance();
                            }
                            let text = self.source[start..self.pos].to_string();
                            tokens.push(Token {
                                token_type: TokenType::Operator,
                                value: text,
                                line,
                                col,
                            });
                        } else {
                            tokens.push(Token {
                                token_type: TokenType::Operator,
                                value: "*".to_string(),
                                line,
                                col,
                            });
                        }
                    } else {
                        tokens.push(Token {
                            token_type: TokenType::Operator,
                            value: "*".to_string(),
                            line,
                            col,
                        });
                    }
                }
                _ => {
                    tokens.push(self.read_operator());
                }
            }
        }

        let line = self.line;
        let col = self.col;
        tokens.push(Token {
            token_type: TokenType::Eof,
            value: String::new(),
            line,
            col,
        });

        Ok(tokens)
    }

    pub fn tokenize(&mut self) -> Result<Vec<Token>> {
        let tokens = self.tokenize_raw()?;
        if tokens.len() > MAX_TOKEN_COUNT {
            return Err(Error::Lexer(format!(
                "token count limit exceeded ({})",
                MAX_TOKEN_COUNT
            )));
        }
        Ok(tokens)
    }
}

pub fn tokenize(source: &str) -> Result<Vec<Token>> {
    let mut lexer = Lexer::new(source);
    lexer.tokenize()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_tokenize() {
        let source = "0 0 m 100 0 l 100 100 l 0 100 l H f";
        let tokens = tokenize(source).unwrap();
        assert!(tokens.len() >= 14);
        assert_eq!(tokens[0].token_type, TokenType::Number);
    }
}
