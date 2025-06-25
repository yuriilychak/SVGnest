use crate::geometry::point::Point;

pub fn get_area(poly: &Vec<Point<i32>>) -> f64 {
    let point_count = poly.len();
    if point_count < 3 {
        return 0.0;
    }

    let mut result: i64 = 0;
    let mut j = point_count - 1;

    for i in 0..point_count {
        result += ((poly[j].x + poly[i].x) as i64) * ((poly[j].y - poly[i].y) as i64);
        j = i;
    }

    -(result as f64) * 0.5
}