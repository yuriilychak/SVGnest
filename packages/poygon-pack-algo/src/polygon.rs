use crate::point::{almost_equal, Point};

#[derive(Clone, Debug)]
pub(crate) struct Polygon {
    pub(crate) points: Vec<Point>,
    pub(crate) children: Vec<Polygon>,
}

impl Polygon {
    pub(crate) fn rotate(&self, degrees: f64) -> Self {
        Self {
            points: self
                .points
                .iter()
                .copied()
                .map(|point| point.rotate(degrees))
                .collect(),
            children: self
                .children
                .iter()
                .map(|child| child.rotate(degrees))
                .collect(),
        }
    }

    pub(crate) fn bounds(&self) -> Option<(Point, Point)> {
        let first = *self.points.first()?;
        Some(
            self.points
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

    pub(crate) fn is_rectangle(&self, tolerance: f64) -> bool {
        let Some((min, max)) = self.bounds() else {
            return false;
        };
        self.points.iter().all(|point| {
            (almost_equal(point.x, min.x, tolerance) || almost_equal(point.x, max.x, tolerance))
                && (almost_equal(point.y, min.y, tolerance)
                    || almost_equal(point.y, max.y, tolerance))
        })
    }
}
