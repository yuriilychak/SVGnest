use crate::error::{Error, Result};
use crate::model::*;

const MAX_PATH_D_LENGTH: usize = 10 * 1024 * 1024;
const MAX_PATH_SEGMENTS: usize = 1_000_000;

#[derive(Clone, Copy, Debug)]
enum Token {
    Cmd(char),
    Num(f64),
}

pub fn parse_svg_path(d: &str) -> Result<Vec<Vec<PathSegment>>> {
    if d.len() > MAX_PATH_D_LENGTH {
        return Err(Error::SvgPath(format!(
            "SVG path `d` attribute too large: {} bytes (limit {})",
            d.len(),
            MAX_PATH_D_LENGTH
        )));
    }

    let tokens = tokenize_path_data(d);
    let mut subpaths: Vec<Vec<PathSegment>> = Vec::new();
    let mut current: Vec<PathSegment> = Vec::new();
    let mut total_segments: usize = 0;
    let mut cx: f64 = 0.0;
    let mut cy: f64 = 0.0;
    let mut sx: f64 = 0.0;
    let mut sy: f64 = 0.0;
    let mut last_cp: Option<(f64, f64)> = None;
    let mut last_cmd: char = '\0';

    let mut i = 0;
    while i < tokens.len() {
        let cmd = match tokens[i] {
            Token::Cmd(c) => {
                i += 1;
                c
            }
            _ => {
                if last_cmd == 'M' {
                    'L'
                } else if last_cmd == 'm' {
                    'l'
                } else {
                    last_cmd
                }
            }
        };

        match cmd {
            'M' | 'm' => {
                let (nums, new_i) = consume_numbers(&tokens, i, 2);
                i = new_i;
                if nums.is_empty() {
                    continue;
                }
                let (mut x, mut y) = (nums[0], nums[1]);
                if cmd == 'm' {
                    x += cx;
                    y += cy;
                }
                if !current.is_empty() {
                    total_segments += current.len();
                    subpaths.push(std::mem::take(&mut current));
                }
                current.push(PathSegment {
                    seg_type: SegmentType::Moveto,
                    points: vec![Point { x, y }],
                    smooth: true,
                });
                cx = x;
                cy = y;
                sx = x;
                sy = y;
                last_cp = None;

                while i < tokens.len() && matches!(tokens[i], Token::Num(_)) {
                    let (nums, new_i) = consume_numbers(&tokens, i, 2);
                    i = new_i;
                    if nums.len() < 2 {
                        break;
                    }
                    let (mut x, mut y) = (nums[0], nums[1]);
                    if cmd == 'm' {
                        x += cx;
                        y += cy;
                    }
                    current.push(PathSegment {
                        seg_type: SegmentType::Lineto,
                        points: vec![Point { x, y }],
                        smooth: true,
                    });
                    cx = x;
                    cy = y;
                    last_cp = None;
                }
            }

            'L' | 'l' => {
                let (nums, new_i) = consume_numbers(&tokens, i, 2);
                i = new_i;
                if nums.len() < 2 {
                    continue;
                }
                let (mut x, mut y) = (nums[0], nums[1]);
                if cmd == 'l' {
                    x += cx;
                    y += cy;
                }
                current.push(PathSegment {
                    seg_type: SegmentType::Lineto,
                    points: vec![Point { x, y }],
                    smooth: true,
                });
                cx = x;
                cy = y;
                last_cp = None;
            }

            'H' | 'h' => {
                let (nums, new_i) = consume_numbers(&tokens, i, 1);
                i = new_i;
                if nums.is_empty() {
                    continue;
                }
                let mut x = nums[0];
                if cmd == 'h' {
                    x += cx;
                }
                current.push(PathSegment {
                    seg_type: SegmentType::Lineto,
                    points: vec![Point { x, y: cy }],
                    smooth: true,
                });
                cx = x;
                last_cp = None;
            }

            'V' | 'v' => {
                let (nums, new_i) = consume_numbers(&tokens, i, 1);
                i = new_i;
                if nums.is_empty() {
                    continue;
                }
                let mut y = nums[0];
                if cmd == 'v' {
                    y += cy;
                }
                current.push(PathSegment {
                    seg_type: SegmentType::Lineto,
                    points: vec![Point { x: cx, y }],
                    smooth: true,
                });
                cy = y;
                last_cp = None;
            }

            'C' | 'c' => {
                let (nums, new_i) = consume_numbers(&tokens, i, 6);
                i = new_i;
                if nums.len() < 6 {
                    continue;
                }
                let (mut x1, mut y1, mut x2, mut y2, mut x, mut y) =
                    (nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]);
                if cmd == 'c' {
                    x1 += cx;
                    y1 += cy;
                    x2 += cx;
                    y2 += cy;
                    x += cx;
                    y += cy;
                }
                current.push(PathSegment {
                    seg_type: SegmentType::Curveto,
                    points: vec![
                        Point { x: x1, y: y1 },
                        Point { x: x2, y: y2 },
                        Point { x, y },
                    ],
                    smooth: true,
                });
                last_cp = Some((x2, y2));
                cx = x;
                cy = y;
            }

            'S' | 's' => {
                let (nums, new_i) = consume_numbers(&tokens, i, 4);
                i = new_i;
                if nums.len() < 4 {
                    continue;
                }
                let (mut x2, mut y2, mut x, mut y) = (nums[0], nums[1], nums[2], nums[3]);
                if cmd == 's' {
                    x2 += cx;
                    y2 += cy;
                    x += cx;
                    y += cy;
                }
                let (x1, y1) = match last_cp {
                    Some((lcx, lcy))
                        if last_cmd == 'C' || last_cmd == 'c' || last_cmd == 'S' || last_cmd == 's' =>
                    {
                        (2.0 * cx - lcx, 2.0 * cy - lcy)
                    }
                    _ => (cx, cy),
                };
                current.push(PathSegment {
                    seg_type: SegmentType::Curveto,
                    points: vec![
                        Point { x: x1, y: y1 },
                        Point { x: x2, y: y2 },
                        Point { x, y },
                    ],
                    smooth: true,
                });
                last_cp = Some((x2, y2));
                cx = x;
                cy = y;
            }

            'Q' | 'q' => {
                let (nums, new_i) = consume_numbers(&tokens, i, 4);
                i = new_i;
                if nums.len() < 4 {
                    continue;
                }
                let (mut qx1, mut qy1, mut qx, mut qy) = (nums[0], nums[1], nums[2], nums[3]);
                if cmd == 'q' {
                    qx1 += cx;
                    qy1 += cy;
                    qx += cx;
                    qy += cy;
                }
                let seg = quadratic_to_cubic(cx, cy, qx1, qy1, qx, qy);
                current.push(seg);
                last_cp = Some((qx1, qy1));
                cx = qx;
                cy = qy;
            }

            'T' | 't' => {
                let (nums, new_i) = consume_numbers(&tokens, i, 2);
                i = new_i;
                if nums.len() < 2 {
                    continue;
                }
                let (mut qx, mut qy) = (nums[0], nums[1]);
                if cmd == 't' {
                    qx += cx;
                    qy += cy;
                }
                let (qx1, qy1) = match last_cp {
                    Some((lcx, lcy))
                        if last_cmd == 'Q' || last_cmd == 'q' || last_cmd == 'T' || last_cmd == 't' =>
                    {
                        (2.0 * cx - lcx, 2.0 * cy - lcy)
                    }
                    _ => (cx, cy),
                };
                let seg = quadratic_to_cubic(cx, cy, qx1, qy1, qx, qy);
                current.push(seg);
                last_cp = Some((qx1, qy1));
                cx = qx;
                cy = qy;
            }

            'A' | 'a' => {
                let (nums, new_i) = consume_numbers(&tokens, i, 7);
                i = new_i;
                if nums.len() < 7 {
                    continue;
                }
                let rx = nums[0];
                let ry = nums[1];
                let rotation = nums[2];
                let large_arc = nums[3] as u8;
                let sweep = nums[4] as u8;
                let (mut x, mut y) = (nums[5], nums[6]);
                if cmd == 'a' {
                    x += cx;
                    y += cy;
                }
                let segs = arc_to_cubics(rx, ry, rotation, large_arc, sweep, x, y, cx, cy);
                current.extend(segs);
                cx = x;
                cy = y;
                last_cp = None;
            }

            'Z' | 'z' => {
                current.push(PathSegment {
                    seg_type: SegmentType::Closepath,
                    points: vec![],
                    smooth: true,
                });
                cx = sx;
                cy = sy;
                last_cp = None;
            }

            _ => {}
        }

        last_cmd = cmd;

        if total_segments + current.len() > MAX_PATH_SEGMENTS {
            return Err(Error::SvgPath(format!(
                "SVG path segment count exceeds limit ({})",
                MAX_PATH_SEGMENTS
            )));
        }
    }

    if !current.is_empty() {
        subpaths.push(current);
    }

    Ok(subpaths)
}

fn tokenize_path_data(d: &str) -> Vec<Token> {
    let re = regex_lite::Regex::new(
        r"([MmZzLlHhVvCcSsQqTtAa])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)",
    )
    .unwrap();
    let mut tokens = Vec::new();
    for cap in re.captures_iter(d) {
        if let Some(m) = cap.get(1) {
            tokens.push(Token::Cmd(m.as_str().chars().next().unwrap()));
        } else if let Some(m) = cap.get(2) {
            tokens.push(Token::Num(m.as_str().parse::<f64>().unwrap()));
        }
    }
    tokens
}

fn consume_numbers(tokens: &[Token], start: usize, count: usize) -> (Vec<f64>, usize) {
    let mut nums = Vec::new();
    let mut i = start;
    while nums.len() < count && i < tokens.len() {
        match tokens[i] {
            Token::Num(n) => {
                nums.push(n);
                i += 1;
            }
            Token::Cmd(_) => break,
        }
    }
    (nums, i)
}

fn quadratic_to_cubic(
    cx: f64,
    cy: f64,
    qx1: f64,
    qy1: f64,
    qx: f64,
    qy: f64,
) -> PathSegment {
    let cp1x = cx + 2.0 / 3.0 * (qx1 - cx);
    let cp1y = cy + 2.0 / 3.0 * (qy1 - cy);
    let cp2x = qx + 2.0 / 3.0 * (qx1 - qx);
    let cp2y = qy + 2.0 / 3.0 * (qy1 - qy);
    PathSegment {
        seg_type: SegmentType::Curveto,
        points: vec![
            Point {
                x: cp1x,
                y: cp1y,
            },
            Point {
                x: cp2x,
                y: cp2y,
            },
            Point { x: qx, y: qy },
        ],
        smooth: true,
    }
}

#[allow(clippy::too_many_arguments)]
fn arc_to_cubics(
    rx: f64,
    ry: f64,
    rotation: f64,
    large_arc: u8,
    sweep: u8,
    x: f64,
    y: f64,
    cx: f64,
    cy: f64,
) -> Vec<PathSegment> {
    if rx == 0.0 || ry == 0.0 {
        return vec![PathSegment {
            seg_type: SegmentType::Lineto,
            points: vec![Point { x, y }],
            smooth: true,
        }];
    }

    let mut rx = rx.abs();
    let mut ry = ry.abs();
    let phi = rotation.to_radians();
    let large = large_arc != 0;
    let sweep_flag = sweep != 0;

    let dx = (cx - x) / 2.0;
    let dy = (cy - y) / 2.0;
    let cos_phi = phi.cos();
    let sin_phi = phi.sin();
    let x1p = cos_phi * dx + sin_phi * dy;
    let y1p = -sin_phi * dx + cos_phi * dy;

    let x1p_sq = x1p * x1p;
    let y1p_sq = y1p * y1p;
    let rx_sq = rx * rx;
    let ry_sq = ry * ry;
    let ratio = x1p_sq / rx_sq + y1p_sq / ry_sq;
    if ratio > 1.0 {
        let scale = ratio.sqrt();
        rx *= scale;
        ry *= scale;
    }
    let rx_sq = rx * rx;
    let ry_sq = ry * ry;

    let num = (rx_sq * ry_sq - rx_sq * y1p_sq - ry_sq * x1p_sq).max(0.0);
    let den = rx_sq * y1p_sq + ry_sq * x1p_sq;
    if den == 0.0 {
        return vec![PathSegment {
            seg_type: SegmentType::Lineto,
            points: vec![Point { x, y }],
            smooth: true,
        }];
    }
    let mut sq = (num / den).sqrt();
    if large == sweep_flag {
        sq = -sq;
    }
    let cxp = sq * rx * y1p / ry;
    let cyp = -sq * ry * x1p / rx;

    let center_x = cos_phi * cxp - sin_phi * cyp + (cx + x) / 2.0;
    let center_y = sin_phi * cxp + cos_phi * cyp + (cy + y) / 2.0;

    let angle_fn = |ux: f64, uy: f64, vx: f64, vy: f64| -> f64 {
        let n = (ux * ux + uy * uy).sqrt() * (vx * vx + vy * vy).sqrt();
        if n == 0.0 {
            return 0.0;
        }
        let mut c = (ux * vx + uy * vy) / n;
        c = c.clamp(-1.0, 1.0);
        let a = c.acos();
        if ux * vy - uy * vx < 0.0 {
            -a
        } else {
            a
        }
    };

    let theta1 = angle_fn(1.0, 0.0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let mut dtheta = angle_fn(
        (x1p - cxp) / rx,
        (y1p - cyp) / ry,
        (-x1p - cxp) / rx,
        (-y1p - cyp) / ry,
    );

    if !sweep_flag && dtheta > 0.0 {
        dtheta -= 2.0 * std::f64::consts::PI;
    } else if sweep_flag && dtheta < 0.0 {
        dtheta += 2.0 * std::f64::consts::PI;
    }

    let n_segs = (dtheta.abs() / (std::f64::consts::PI / 2.0))
        .ceil()
        .max(1.0) as usize;
    let d_per = dtheta / n_segs as f64;

    let mut segments = Vec::with_capacity(n_segs);
    for i in 0..n_segs {
        let t1 = theta1 + i as f64 * d_per;
        let t2 = theta1 + (i + 1) as f64 * d_per;
        let alpha = 4.0 / 3.0 * ((t2 - t1) / 4.0).tan();

        let cos_t1 = t1.cos();
        let sin_t1 = t1.sin();
        let cos_t2 = t2.cos();
        let sin_t2 = t2.sin();

        let ep1x = cos_t1 - alpha * sin_t1;
        let ep1y = sin_t1 + alpha * cos_t1;
        let ep2x = cos_t2 + alpha * sin_t2;
        let ep2y = sin_t2 - alpha * cos_t2;

        let xf = |px: f64, py: f64| -> Point {
            let xx = cos_phi * rx * px - sin_phi * ry * py + center_x;
            let yy = sin_phi * rx * px + cos_phi * ry * py + center_y;
            Point { x: xx, y: yy }
        };

        segments.push(PathSegment {
            seg_type: SegmentType::Curveto,
            points: vec![xf(ep1x, ep1y), xf(ep2x, ep2y), xf(cos_t2, sin_t2)],
            smooth: true,
        });
    }

    segments
}
