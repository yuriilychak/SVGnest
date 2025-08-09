use crate::clipper::scanbeam::Scanbeam;

#[cfg(test)]
mod scanbeam_tests {
    use super::*;

    #[test]
    fn test_insert_and_pop() {
        let mut scanbeam = Scanbeam::new();

        scanbeam.insert(5);
        scanbeam.insert(3);
        scanbeam.insert(7);
        scanbeam.insert(3); // duplicate, should be ignored

        assert_eq!(scanbeam.len(), 3);
        assert_eq!(scanbeam.pop().unwrap(), 7);
        assert_eq!(scanbeam.pop().unwrap(), 5);
        assert_eq!(scanbeam.pop().unwrap(), 3);
        assert!(scanbeam.is_empty());
    }

    #[test]
    fn test_pop_empty() {
        let mut scanbeam = Scanbeam::new();
        assert!(scanbeam.pop().is_err());
    }

    #[test]
    fn test_clean() {
        let mut scanbeam = Scanbeam::new();
        scanbeam.insert(1);
        scanbeam.insert(2);
        scanbeam.clean();
        assert!(scanbeam.is_empty());
    }

    #[test]
    fn test_insert_ordering() {
        let mut scanbeam = Scanbeam::new();

        // Insert in random order
        scanbeam.insert(10);
        scanbeam.insert(5);
        scanbeam.insert(15);
        scanbeam.insert(1);
        scanbeam.insert(8);

        // Should pop in descending order (highest first)
        assert_eq!(scanbeam.pop().unwrap(), 15);
        assert_eq!(scanbeam.pop().unwrap(), 10);
        assert_eq!(scanbeam.pop().unwrap(), 8);
        assert_eq!(scanbeam.pop().unwrap(), 5);
        assert_eq!(scanbeam.pop().unwrap(), 1);
        assert!(scanbeam.is_empty());
    }

    #[test]
    fn test_default() {
        let scanbeam = Scanbeam::default();
        assert!(scanbeam.is_empty());
        assert_eq!(scanbeam.len(), 0);
    }
}
