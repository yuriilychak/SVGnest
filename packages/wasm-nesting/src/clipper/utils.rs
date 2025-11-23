use crate::{geometry::point::Point, utils::math::cycle_index};

/// Shows an error message as a warning in the terminal
/// Equivalent to TypeScript's showError function
pub fn show_error(message: &str) {
    eprintln!("Warning: {}", message);
}

pub fn clean_polygon(path: &Vec<Point<i32>>, distance: f64) -> Vec<Point<i32>> {
    let mut point_count = path.len();
    if point_count < 3 {
        return Vec::new();
    }

    let mut result: Vec<Point<i32>> = Vec::with_capacity(point_count);
    let mut marked: Vec<bool> = vec![false; point_count];

    for p in path.iter() {
        result.push(Point::<i32>::from(p));
    }

    let dist_sqrd = distance * distance;
    let mut curr_index = 0;

    unsafe {
        while curr_index < point_count && !marked[curr_index] && point_count > 2 {
            let prev_index = cycle_index(curr_index, point_count, -1);
            let next_index = cycle_index(curr_index, point_count, 1);

            let curr_point = &result[curr_index];
            let prev_point = &result[prev_index];
            let next_point = &result[next_index];

            if curr_point.close_to(&*prev_point, dist_sqrd) {
                marked[prev_index] = false;
                result.remove(curr_index);
                marked.remove(curr_index);
                point_count -= 1;
                if prev_index < curr_index {
                    curr_index = prev_index;
                } else {
                    curr_index = prev_index - 1;
                }
                marked[curr_index] = false;
            } else if prev_point.close_to(&*next_point, dist_sqrd) {
                result.remove(next_index);
                marked.remove(next_index);
                if next_index < curr_index {
                    result.remove(curr_index - 1);
                    marked.remove(curr_index - 1);
                } else {
                    result.remove(curr_index);
                    marked.remove(curr_index);
                }
                point_count -= 2;

                if prev_index < curr_index {
                    curr_index = prev_index;
                } else {
                    curr_index = prev_index - 2;
                }
                marked[curr_index] = false;
            } else if Point::slopes_near_collinear(
                &*prev_point,
                &*curr_point,
                &*next_point,
                dist_sqrd,
            ) {
                result.remove(curr_index);
                marked.remove(curr_index);
                point_count -= 1;
                if prev_index < curr_index {
                    curr_index = prev_index;
                } else {
                    curr_index = prev_index - 1;
                }
                marked[curr_index] = false;
            } else {
                marked[curr_index] = true;
                curr_index = cycle_index(curr_index, point_count, 1);
            }
        }
    }

    if point_count < 3 {
        Vec::new()
    } else {
        result
    }
}
