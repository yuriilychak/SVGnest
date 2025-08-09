use crate::clipper::intersect_node::IntersectNode;

#[cfg(test)]
mod intersect_node_tests {
    use super::*;

    #[test]
    fn test_new() {
        let intersect_node = IntersectNode::new();
        assert!(intersect_node.is_empty());
        assert_eq!(intersect_node.len(), 0);
    }

    #[test]
    fn test_add_and_get() {
        let mut intersect_node = IntersectNode::new();

        intersect_node.add(1, 2, 100, 200);
        assert_eq!(intersect_node.len(), 1);
        assert!(!intersect_node.is_empty());

        assert_eq!(intersect_node.get_edge1_index(0), 1);
        assert_eq!(intersect_node.get_edge2_index(0), 2);
        assert_eq!(intersect_node.get_x(0), 100);
        assert_eq!(intersect_node.get_y(0), 200);
    }

    #[test]
    fn test_add_multiple() {
        let mut intersect_node = IntersectNode::new();

        intersect_node.add(1, 2, 100, 200);
        intersect_node.add(3, 4, 150, 250);
        intersect_node.add(5, 6, 75, 175);

        assert_eq!(intersect_node.len(), 3);

        // Check first item
        assert_eq!(intersect_node.get_edge1_index(0), 1);
        assert_eq!(intersect_node.get_edge2_index(0), 2);
        assert_eq!(intersect_node.get_x(0), 100);
        assert_eq!(intersect_node.get_y(0), 200);

        // Check second item
        assert_eq!(intersect_node.get_edge1_index(1), 3);
        assert_eq!(intersect_node.get_edge2_index(1), 4);
        assert_eq!(intersect_node.get_x(1), 150);
        assert_eq!(intersect_node.get_y(1), 250);

        // Check third item
        assert_eq!(intersect_node.get_edge1_index(2), 5);
        assert_eq!(intersect_node.get_edge2_index(2), 6);
        assert_eq!(intersect_node.get_x(2), 75);
        assert_eq!(intersect_node.get_y(2), 175);
    }

    #[test]
    fn test_swap() {
        let mut intersect_node = IntersectNode::new();

        intersect_node.add(1, 2, 100, 200);
        intersect_node.add(3, 4, 150, 250);

        // Swap the two items
        intersect_node.swap(0, 1);

        // Check that items are swapped
        assert_eq!(intersect_node.get_edge1_index(0), 3);
        assert_eq!(intersect_node.get_edge2_index(0), 4);
        assert_eq!(intersect_node.get_x(0), 150);
        assert_eq!(intersect_node.get_y(0), 250);

        assert_eq!(intersect_node.get_edge1_index(1), 1);
        assert_eq!(intersect_node.get_edge2_index(1), 2);
        assert_eq!(intersect_node.get_x(1), 100);
        assert_eq!(intersect_node.get_y(1), 200);
    }

    #[test]
    fn test_sort() {
        let mut intersect_node = IntersectNode::new();

        // Add items with different y values
        intersect_node.add(1, 2, 100, 200); // y = 200
        intersect_node.add(3, 4, 150, 300); // y = 300
        intersect_node.add(5, 6, 75, 100); // y = 100
        intersect_node.add(7, 8, 125, 250); // y = 250

        intersect_node.sort();

        // After sorting, should be in descending order by y value: 300, 250, 200, 100
        assert_eq!(intersect_node.get_y(0), 300);
        assert_eq!(intersect_node.get_edge1_index(0), 3);

        assert_eq!(intersect_node.get_y(1), 250);
        assert_eq!(intersect_node.get_edge1_index(1), 7);

        assert_eq!(intersect_node.get_y(2), 200);
        assert_eq!(intersect_node.get_edge1_index(2), 1);

        assert_eq!(intersect_node.get_y(3), 100);
        assert_eq!(intersect_node.get_edge1_index(3), 5);
    }

    #[test]
    fn test_sort_equal_y_values() {
        let mut intersect_node = IntersectNode::new();

        // Add items with same y values
        intersect_node.add(1, 2, 100, 200);
        intersect_node.add(3, 4, 150, 200);
        intersect_node.add(5, 6, 75, 200);

        intersect_node.sort();

        // All should have same y value
        assert_eq!(intersect_node.get_y(0), 200);
        assert_eq!(intersect_node.get_y(1), 200);
        assert_eq!(intersect_node.get_y(2), 200);

        // Order of equal elements is stable but may vary
        assert_eq!(intersect_node.len(), 3);
    }

    #[test]
    fn test_clean() {
        let mut intersect_node = IntersectNode::new();

        intersect_node.add(1, 2, 100, 200);
        intersect_node.add(3, 4, 150, 250);

        assert_eq!(intersect_node.len(), 2);
        assert!(!intersect_node.is_empty());

        intersect_node.clean();

        assert_eq!(intersect_node.len(), 0);
        assert!(intersect_node.is_empty());
    }

    #[test]
    fn test_default() {
        let intersect_node = IntersectNode::default();
        assert!(intersect_node.is_empty());
        assert_eq!(intersect_node.len(), 0);
    }

    #[test]
    fn test_negative_values() {
        let mut intersect_node = IntersectNode::new();

        intersect_node.add(-1, -2, -100, -200);

        assert_eq!(intersect_node.get_edge1_index(0), -1);
        assert_eq!(intersect_node.get_edge2_index(0), -2);
        assert_eq!(intersect_node.get_x(0), -100);
        assert_eq!(intersect_node.get_y(0), -200);
    }
}
