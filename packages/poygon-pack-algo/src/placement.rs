use std::collections::HashMap;

use clipper2_rs::{difference, union_self, FillRule, Path64, Paths64, Point64};

use crate::cache;
use crate::point::{almost_equal, Point};
use crate::polygon::Polygon;
use crate::protocol::{parse_config, Config, CLIPPER_SCALE};
use crate::binary::{frame, Writer};

const TYPE_PLACEMENT: u64 = 2;
pub(crate) const COMPACT_PLACEMENT_RESULT_COMMAND: u8 = 0x87;

#[derive(Clone)]
struct Part {
    id: i32,
    rotation: f64,
    polygon: Polygon,
}

#[derive(Clone)]
struct Placement {
    id: i32,
    x: f64,
    y: f64,
    rotation: f64,
}

struct Request {
    config: Config,
    bin: Polygon,
    paths: Vec<Part>,
    nfp_cache: HashMap<u32, Vec<Vec<Point>>>,
}

fn read_usize(data: &[f64], index: &mut usize, label: &str) -> Result<usize, String> {
    let value = *data.get(*index).ok_or_else(|| format!("Missing {label}"))?;
    *index += 1;
    if !value.is_finite() || value < 0.0 || value.fract() != 0.0 {
        return Err(format!("Invalid {label}"));
    }
    Ok(value as usize)
}

fn read_f64(data: &[f64], index: &mut usize, label: &str) -> Result<f64, String> {
    let value = *data.get(*index).ok_or_else(|| format!("Missing {label}"))?;
    *index += 1;
    if !value.is_finite() {
        return Err(format!("Invalid {label}"));
    }
    Ok(value)
}

fn parse_polygon(data: &[f64], index: &mut usize) -> Result<Polygon, String> {
    let point_count = read_usize(data, index, "polygon point count")?;
    let child_count = read_usize(data, index, "polygon child count")?;
    let mut points = Vec::with_capacity(point_count);
    for _ in 0..point_count {
        points.push(Point {
            x: read_f64(data, index, "polygon x coordinate")?,
            y: read_f64(data, index, "polygon y coordinate")?,
        });
    }
    let mut children = Vec::with_capacity(child_count);
    for _ in 0..child_count {
        children.push(parse_polygon(data, index)?);
    }
    Ok(Polygon { points, children })
}

fn parse_nfp(data: &[f64]) -> Result<(u32, Vec<Vec<Point>>), String> {
    let mut index = 0;
    let key = read_usize(data, &mut index, "NFP cache key")? as u32;
    let contour_count = read_usize(data, &mut index, "NFP contour count")?;
    let mut contours = Vec::with_capacity(contour_count);
    for _ in 0..contour_count {
        let point_count = read_usize(data, &mut index, "NFP point count")?;
        let mut contour = Vec::with_capacity(point_count);
        for _ in 0..point_count {
            contour.push(Point {
                x: read_f64(data, &mut index, "NFP x coordinate")?,
                y: read_f64(data, &mut index, "NFP y coordinate")?,
            });
        }
        contours.push(contour);
    }
    if index != data.len() {
        return Err("NFP cache entry has trailing data".into());
    }
    Ok((key, contours))
}

fn parse_request(data: &[f64]) -> Result<Request, String> {
    if data.first().copied().unwrap_or_default() as u64 != TYPE_PLACEMENT {
        return Err("Unsupported serialized placement request".into());
    }
    let mut index = 1;
    let config = parse_config(data, &mut index)?;
    let path_count = read_usize(data, &mut index, "path count")?;
    let bin = parse_polygon(data, &mut index)?;
    let mut paths = Vec::with_capacity(path_count);
    for _ in 0..path_count {
        let id = read_f64(data, &mut index, "part ID")? as i32;
        let rotation = read_f64(data, &mut index, "part rotation")?;
        paths.push(Part {
            id,
            rotation,
            polygon: parse_polygon(data, &mut index)?,
        });
    }
    let cache = cache::parse(&data[index..]).ok_or("Invalid opaque NFP cache")?;
    let mut nfp_cache = HashMap::with_capacity(cache.len());
    for (key, entry) in cache {
        let (_, contours) = parse_nfp(&entry)?;
        nfp_cache.insert(key, contours);
    }
    Ok(Request {
        config,
        bin,
        paths,
        nfp_cache,
    })
}

fn rotation_index(degrees: f64, rotations: f64) -> u32 {
    (degrees / (360.0 / rotations))
        .round()
        .rem_euclid(rotations) as u32
}

fn nfp_key(a: i32, b: i32, inside: bool, a_rotation: u32, b_rotation: u32) -> u32 {
    ((a + 1) as u32)
        | (((b + 1) as u32) << 11)
        | ((inside as u32) << 22)
        | (a_rotation << 23)
        | (b_rotation << 27)
}

fn bounds(points: &[Point]) -> Option<(Point, Point)> {
    let first = *points.first()?;
    Some(
        points
            .iter()
            .skip(1)
            .fold((first, first), |(min, max), point| {
                (
                    Point {
                        x: min.x.min(point.x),
                        y: min.y.min(point.y),
                    },
                    Point {
                        x: max.x.max(point.x),
                        y: max.y.max(point.y),
                    },
                )
            }),
    )
}

fn signed_area(points: &[Point]) -> f64 {
    if points.len() < 3 {
        return 0.0;
    }
    points
        .iter()
        .enumerate()
        .map(|(index, point)| {
            let previous = points[(index + points.len() - 1) % points.len()];
            (previous.x + point.x) * (previous.y - point.y)
        })
        .sum::<f64>()
        / 2.0
}

fn to_clipper(contours: &[Vec<Point>], scale: f64) -> Paths64 {
    contours
        .iter()
        .filter_map(|contour| {
            let path: Path64 = contour
                .iter()
                .map(|point| {
                    Point64::new(
                        (point.x * scale).round() as i64,
                        (point.y * scale).round() as i64,
                    )
                })
                .collect();
            (path.len() >= 3).then_some(path)
        })
        .collect()
}

fn from_clipper(paths: Paths64, scale: f64) -> Vec<Vec<Point>> {
    paths
        .into_iter()
        .map(|path| {
            path.into_iter()
                .map(|point| Point {
                    x: point.x as f64 / scale,
                    y: point.y as f64 / scale,
                })
                .collect()
        })
        .collect()
}

fn serialize(
    placements: &[Vec<Placement>],
    fitness: f64,
    placed_area: f64,
    bin_area: f64,
) -> Vec<f64> {
    let total = placements.iter().map(Vec::len).sum::<usize>();
    let mut result = Vec::with_capacity(4 + placements.len() + total * 4);
    result.extend([fitness, placed_area, bin_area, placements.len() as f64]);
    for bin in placements {
        result.push(bin.len() as f64);
        for placement in bin {
            result.extend([
                placement.id as f64,
                placement.x,
                placement.y,
                placement.rotation,
            ]);
        }
    }
    result
}

/// Converts the legacy placement vector to its UI-facing compact frame.
pub(crate) fn compact_result(data: &[f64]) -> Option<Vec<u8>> {
    let mut index = 0;
    let fitness = *data.get(index)?; index += 1;
    let placed_area = *data.get(index)?; index += 1;
    let bin_area = *data.get(index)?; index += 1;
    let bin_count = *data.get(index)?;
    (fitness.is_finite() && placed_area.is_finite() && bin_area.is_finite() && bin_count.is_finite() && bin_count.fract() == 0.0 && (0.0..=u32::MAX as f64).contains(&bin_count)).then_some(())?;
    index += 1;
    let mut writer = Writer::new();
    writer.f64(fitness);
    writer.f64(placed_area);
    writer.f64(bin_area);
    writer.u32(bin_count as u32);
    for _ in 0..bin_count as usize {
        let count = *data.get(index)?; index += 1;
        (count.is_finite() && count.fract() == 0.0 && (0.0..=u32::MAX as f64).contains(&count)).then_some(())?;
        writer.u32(count as u32);
        for _ in 0..count as usize {
            let id = *data.get(index)?; index += 1;
            let x = *data.get(index)?; index += 1;
            let y = *data.get(index)?; index += 1;
            let rotation = *data.get(index)?; index += 1;
            (id.is_finite() && id.fract() == 0.0 && (0.0..=u32::MAX as f64).contains(&id) && x.is_finite() && y.is_finite() && rotation.is_finite()).then_some(())?;
            writer.u32(id as u32);
            writer.f32(x as f32);
            writer.f32(y as f32);
            writer.f32(rotation as f32);
        }
    }
    (index == data.len()).then(|| frame(COMPACT_PLACEMENT_RESULT_COMMAND, 0, &writer.finish())).flatten()
}

fn empty_result() -> Vec<f64> {
    vec![0.0, 0.0, 0.0, 0.0]
}

pub(crate) fn generate(data: Vec<f64>) -> Vec<f64> {
    let Ok(request) = parse_request(&data) else {
        return empty_result();
    };
    let bin_area = signed_area(&request.bin.points).abs();
    if bin_area == 0.0 {
        return empty_result();
    }
    let mut paths: Vec<Part> = request
        .paths
        .into_iter()
        .map(|mut part| {
            part.polygon = part.polygon.rotate(part.rotation);
            part
        })
        .collect();
    let mut all_placements = Vec::new();
    let mut fitness = 0.0;
    let mut placed_area = 0.0;

    while !paths.is_empty() {
        let mut placed: Vec<Part> = Vec::new();
        let mut placements: Vec<Placement> = Vec::new();
        let mut min_width: Option<f64> = None;
        fitness += 1.0;

        for path in &paths {
            let path_rotation = rotation_index(path.rotation, request.config.rotations as f64);
            let bin_key = nfp_key(-1, path.id, true, 0, path_rotation);
            let Some(bin_nfp) = request
                .nfp_cache
                .get(&bin_key)
                .filter(|nfp| !nfp.is_empty())
            else {
                continue;
            };
            let outer_nfps: Option<Vec<&Vec<Vec<Point>>>> = placed
                .iter()
                .map(|placed_path| {
                    let key = nfp_key(
                        placed_path.id,
                        path.id,
                        false,
                        rotation_index(placed_path.rotation, request.config.rotations as f64),
                        path_rotation,
                    );
                    request.nfp_cache.get(&key).filter(|nfp| !nfp.is_empty())
                })
                .collect();
            let Some(outer_nfps) = outer_nfps else {
                continue;
            };

            if placed.is_empty() {
                let Some((point, _)) = bin_nfp
                    .iter()
                    .flat_map(|contour| contour.iter())
                    .map(|point| (point, point.x - path.polygon.points[0].x))
                    .min_by(|(_, left), (_, right)| left.total_cmp(right))
                else {
                    continue;
                };
                placements.push(Placement {
                    id: path.id,
                    x: point.x - path.polygon.points[0].x,
                    y: point.y - path.polygon.points[0].y,
                    rotation: path.rotation,
                });
                placed_area += signed_area(&path.polygon.points).abs();
                placed.push(path.clone());
                continue;
            }

            let mut translated_nfps = Vec::new();
            for (index, nfp) in outer_nfps.into_iter().enumerate() {
                for contour in nfp {
                    let translated: Vec<Point> = contour
                        .iter()
                        .map(|point| Point {
                            x: point.x + placements[index].x,
                            y: point.y + placements[index].y,
                        })
                        .collect();
                    if translated.len() >= 3 && signed_area(&translated).abs() > 0.1 {
                        translated_nfps.push(translated);
                    }
                }
            }
            let subjects = to_clipper(&translated_nfps, CLIPPER_SCALE);
            let Ok(combined) = union_self(&subjects, FillRule::NonZero) else {
                continue;
            };
            let bin_paths = to_clipper(bin_nfp, CLIPPER_SCALE);
            let Ok(final_paths) = difference(&bin_paths, &combined, FillRule::NonZero) else {
                continue;
            };
            let final_nfp: Vec<Vec<Point>> = from_clipper(final_paths, CLIPPER_SCALE)
                .into_iter()
                .filter(|contour| contour.len() >= 3 && signed_area(contour).abs() > 0.1)
                .collect();
            if final_nfp.is_empty() {
                continue;
            }

            let mut position: Option<(Placement, f64, f64)> = None;
            for contour in final_nfp {
                if signed_area(&contour).abs() < 2.0 {
                    continue;
                }
                for point in contour {
                    let candidate = Placement {
                        id: path.id,
                        x: point.x - path.polygon.points[0].x,
                        y: point.y - path.polygon.points[0].y,
                        rotation: path.rotation,
                    };
                    let mut all_points = Vec::new();
                    for (placed_index, placed_path) in placed.iter().enumerate() {
                        all_points.extend(placed_path.polygon.points.iter().map(|point| Point {
                            x: point.x + placements[placed_index].x,
                            y: point.y + placements[placed_index].y,
                        }));
                    }
                    all_points.extend(path.polygon.points.iter().map(|point| Point {
                        x: point.x + candidate.x,
                        y: point.y + candidate.y,
                    }));
                    let Some((min, max)) = bounds(&all_points) else {
                        continue;
                    };
                    let width = max.x - min.x;
                    let score = width * 2.0 + max.y - min.y;
                    if position.as_ref().is_none_or(|(_, best_score, best_x)| {
                        score < *best_score
                            || (almost_equal(score, *best_score, 1e-9) && candidate.x < *best_x)
                    }) {
                        let candidate_x = candidate.x;
                        position = Some((candidate, score, candidate_x));
                        min_width = Some(width);
                    }
                }
            }
            if let Some((position, _, _)) = position {
                placements.push(position);
                placed_area += signed_area(&path.polygon.points).abs();
                placed.push(path.clone());
            }
        }

        if let Some(width) = min_width {
            fitness += width / bin_area;
        }
        paths.retain(|path| {
            !placed.iter().any(|placed_path| {
                placed_path.id == path.id && almost_equal(placed_path.rotation, path.rotation, 1e-9)
            })
        });
        if placements.is_empty() {
            break;
        }
        all_placements.push(placements);
    }
    fitness += 2.0 * paths.len() as f64;
    serialize(&all_placements, fitness, placed_area, bin_area)
}

#[cfg(test)]
mod tests {
    use super::generate;

    #[test]
    fn places_a_single_part_using_the_serialized_inner_nfp() {
        // TYPE_PLACEMENT, scale, rotations, path count, cache count, bin, part, cache entry.
        let request = vec![
            2.0,
            169_087_006.0,
            1.0,
            4.0,
            0.0,
            0.0,
            0.0,
            10.0,
            0.0,
            10.0,
            10.0,
            0.0,
            10.0,
            0.0,
            0.0,
            3.0,
            0.0,
            0.0,
            0.0,
            2.0,
            0.0,
            0.0,
            2.0,
            1.0,
            11.0,
            4_196_352.0,
            1.0,
            4.0,
            0.0,
            0.0,
            8.0,
            0.0,
            8.0,
            8.0,
            0.0,
            8.0,
        ];
        let parsed = super::parse_request(&request).unwrap();
        assert!(parsed
            .nfp_cache
            .contains_key(&super::nfp_key(-1, 0, true, 0, 0)));
        assert_eq!(
            generate(request),
            vec![1.0, 2.0, 100.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0]
        );
    }

    #[test]
    fn compacts_placement_transforms_and_ids() {
        let result = vec![0.25, 12.0, 25.0, 1.0, 1.0, 7.0, 1.25, -2.5, 90.0];
        let compact = super::compact_result(&result).unwrap();
        let (command, flags, payload) = crate::binary::parse_frame(&compact).unwrap();
        assert_eq!(command, super::COMPACT_PLACEMENT_RESULT_COMMAND);
        assert_eq!(flags, 0);
        assert_eq!(payload.len(), 8 + 8 + 8 + 4 + 4 + 4 + 4 + 4 + 4);
    }

    #[test]
    fn places_multiple_parts_with_clipper_nfp_subtraction() {
        let mut request = vec![2.0, 169_087_006.0, 2.0];
        request.extend([4.0, 0.0, 0.0, 0.0, 10.0, 0.0, 10.0, 10.0, 0.0, 10.0]);
        for id in 0..2 {
            request.extend([id as f64, 0.0, 3.0, 0.0, 0.0, 0.0, 2.0, 0.0, 0.0, 2.0]);
        }
        request.push(3.0);
        let mut push_nfp = |key: u32, contours: &[&[(f64, f64)]]| {
            let mut entry = vec![key as f64, contours.len() as f64];
            for contour in contours {
                entry.push(contour.len() as f64);
                for (x, y) in *contour {
                    entry.extend([*x, *y]);
                }
            }
            request.push(entry.len() as f64);
            request.extend(entry);
        };
        let inner = &[(0.0, 0.0), (8.0, 0.0), (8.0, 8.0), (0.0, 8.0)];
        push_nfp(super::nfp_key(-1, 0, true, 0, 0), &[inner]);
        push_nfp(super::nfp_key(-1, 1, true, 0, 0), &[inner]);
        push_nfp(
            super::nfp_key(0, 1, false, 0, 0),
            &[&[(-2.0, -2.0), (2.0, -2.0), (2.0, 2.0), (-2.0, 2.0)]],
        );

        let result = generate(request);
        assert_eq!(result[3], 1.0);
        assert_eq!(result[4], 2.0);
    }
}
