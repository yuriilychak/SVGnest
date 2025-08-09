use crate::clipper::local_minima::LocalMinima;

#[cfg(test)]
mod local_minima_tests {
    use super::*;

    #[test]
    fn test_new() {
        let local_minima = LocalMinima::new();
        assert!(local_minima.is_empty());
        assert_eq!(local_minima.len(), 0);
        assert!(local_minima.min_y().is_none());
    }

    #[test]
    fn test_insert_and_get() {
        let mut local_minima = LocalMinima::new();

        let index = local_minima.insert(10, 5, 15);
        assert_eq!(index, 0);
        assert_eq!(local_minima.len(), 1);
        assert_eq!(local_minima.get_y(0), 10);
        assert_eq!(local_minima.get_left_bound(0), 5);
        assert_eq!(local_minima.get_right_bound(0), 15);
        assert_eq!(local_minima.min_y(), Some(10));
    }

    #[test]
    fn test_insert_ordering() {
        let mut local_minima = LocalMinima::new();

        // Insert in various y orders - should be sorted by y descending
        local_minima.insert(5, 1, 2);
        local_minima.insert(10, 3, 4);
        local_minima.insert(8, 5, 6);
        local_minima.insert(10, 7, 8); // Same y value

        assert_eq!(local_minima.len(), 4);

        // Should be ordered: 10, 10, 8, 5 (descending by y)
        assert_eq!(local_minima.get_y(0), 10);
        assert_eq!(local_minima.get_left_bound(0), 3);
        assert_eq!(local_minima.get_right_bound(0), 4);

        assert_eq!(local_minima.get_y(1), 10);
        assert_eq!(local_minima.get_left_bound(1), 7);
        assert_eq!(local_minima.get_right_bound(1), 8);

        assert_eq!(local_minima.get_y(2), 8);
        assert_eq!(local_minima.get_left_bound(2), 5);
        assert_eq!(local_minima.get_right_bound(2), 6);

        assert_eq!(local_minima.get_y(3), 5);
        assert_eq!(local_minima.get_left_bound(3), 1);
        assert_eq!(local_minima.get_right_bound(3), 2);

        assert_eq!(local_minima.min_y(), Some(10));
    }

    #[test]
    fn test_pop() {
        let mut local_minima = LocalMinima::new();

        local_minima.insert(10, 5, 15);
        local_minima.insert(8, 3, 12);

        assert_eq!(local_minima.len(), 2);

        // Pop should return (left_bound, right_bound) of first item
        let result = local_minima.pop().unwrap();
        assert_eq!(result, (5, 15));
        assert_eq!(local_minima.len(), 1);
        assert_eq!(local_minima.min_y(), Some(8));

        let result = local_minima.pop().unwrap();
        assert_eq!(result, (3, 12));
        assert_eq!(local_minima.len(), 0);
        assert!(local_minima.is_empty());
        assert!(local_minima.min_y().is_none());
    }

    #[test]
    fn test_pop_empty() {
        let mut local_minima = LocalMinima::new();
        assert!(local_minima.pop().is_err());
    }

    #[test]
    fn test_default() {
        let local_minima = LocalMinima::default();
        assert!(local_minima.is_empty());
        assert_eq!(local_minima.len(), 0);
    }

    #[test]
    fn test_negative_values() {
        let mut local_minima = LocalMinima::new();

        local_minima.insert(-5, -10, -2);
        local_minima.insert(0, -1, 1);

        assert_eq!(local_minima.get_y(0), 0);
        assert_eq!(local_minima.get_left_bound(0), -1);
        assert_eq!(local_minima.get_right_bound(0), 1);

        assert_eq!(local_minima.get_y(1), -5);
        assert_eq!(local_minima.get_left_bound(1), -10);
        assert_eq!(local_minima.get_right_bound(1), -2);
    }
}
