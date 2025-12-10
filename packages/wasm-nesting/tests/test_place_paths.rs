use wasm_nesting::nesting::place_content::PlaceContent;
use wasm_nesting::nesting::place_flow::place_paths;

#[test]
fn test_place_paths_with_real_data() {
    // Load test data from JSON with u8 input
    let test_json = include_str!("../../../test1.json");
    let test_data: serde_json::Value =
        serde_json::from_str(test_json).expect("Failed to parse JSON");

    // Extract input bytes and expected output
    let input_bytes_array = test_data["input"]
        .as_array()
        .expect("Input is not an array");
    let expected_output = test_data["output"]
        .as_array()
        .expect("Output is not an array");

    // Convert JSON u8 array to actual bytes
    let input_bytes: Vec<u8> = input_bytes_array
        .iter()
        .map(|v| v.as_u64().unwrap_or(0) as u8)
        .collect();

    println!("Input bytes length: {}", input_bytes.len());

    // Convert bytes to f32 array (reinterpret memory as little-endian f32)
    let input_buffer: Vec<f32> = input_bytes
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect();

    println!("Input f32 length: {}", input_buffer.len());
    println!("Expected output length: {}", expected_output.len());

    // Debug: Print first few values to verify correct reading
    println!("\nFirst 10 f32 values from buffer:");
    for i in 0..10.min(input_buffer.len()) {
        println!(
            "  [{}] = {} (0x{:08x})",
            i,
            input_buffer[i],
            input_buffer[i].to_bits()
        );
    }

    // Debug: Check the header values
    if input_buffer.len() >= 4 {
        let nest_config = input_buffer[1].to_bits();
        let area = input_buffer[2];
        let map_buffer_size_bytes = input_buffer[3].to_bits();

        println!("\nHeader values:");
        println!(
            "  nest_config (buffer[1].to_bits()): 0x{:08x} ({})",
            nest_config, nest_config
        );
        println!("  area (buffer[2]): {}", area);
        println!(
            "  map_buffer_size_bytes (buffer[3].to_bits()): {} bytes",
            map_buffer_size_bytes
        );
        println!(
            "  map_buffer_size in f32 units: {}",
            map_buffer_size_bytes / 4
        );
        println!(
            "  node_offset calculation: (16 + {}) / 4 = {}",
            map_buffer_size_bytes,
            (16 + map_buffer_size_bytes) / 4
        );
        println!(
            "  Expected node_offset should be less than buffer length: {}",
            input_buffer.len()
        );
    }

    // Initialize PlaceContent
    let mut place_content = PlaceContent::new();
    place_content.init(&input_buffer);

    println!("\nPlaceContent initialized");
    println!("Node count: {}", place_content.node_count());
    println!("Area: {}", place_content.area());
    println!("Rotations: {}", place_content.rotations());
    println!(
        "NFP cache size: {} entries",
        place_content.nfp_cache().len()
    );

    // Print first few cache keys
    println!("\nFirst 10 cache keys:");
    for (i, key) in place_content.nfp_cache().keys().take(10).enumerate() {
        println!("  {}: 0x{:08x}", i, key);
    }

    // Check what keys we're generating for bin NFPs
    println!("\nGenerating bin NFP keys for first 5 nodes:");
    let empty_node = wasm_nesting::nesting::polygon_node::PolygonNode::new(-1, 0.0, Vec::new());
    for i in 0..5 {
        let node = place_content.node_at(i);
        let key = wasm_nesting::nesting::polygon_node::PolygonNode::generate_nfp_cache_key(
            place_content.rotations(),
            true,
            &empty_node,
            node,
        );
        let exists = place_content.nfp_cache().contains_key(&key);
        println!(
            "  Node {}: source={}, rotation={}, key=0x{:08x}, in_cache={}",
            i, node.source, node.rotation, key, exists
        );
    }

    // Check first few bin NFPs
    println!("\nChecking bin NFPs:");
    for i in 0..10.min(place_content.node_count()) {
        let bin_nfp = place_content.get_bin_nfp(i);
        println!("  Node {}: bin NFP exists = {}", i, bin_nfp.is_some());
        if let Some(nfp) = bin_nfp {
            println!("    NFP buffer size: {} bytes", nfp.len());
        }
    }

    // Call place_paths
    let result = place_paths(&mut place_content);

    println!("\nResult length: {}", result.len());
    println!("Expected length: {}", expected_output.len());

    if result.len() != expected_output.len() {
        println!("\n=== LENGTH MISMATCH DEBUG ===");
        println!(
            "Difference: {} values",
            (result.len() as i32 - expected_output.len() as i32).abs()
        );
        println!("\nFirst 10 result values:");
        for i in 0..10.min(result.len()) {
            println!("  [{}] = {}", i, result[i]);
        }
        println!("\nFirst 10 expected values:");
        for i in 0..10.min(expected_output.len()) {
            println!("  [{}] = {}", i, expected_output[i]);
        }
        println!("\nLast 10 result values:");
        for i in result.len().saturating_sub(10)..result.len() {
            println!("  [{}] = {}", i, result[i]);
        }
        println!("\nLast 10 expected values:");
        for i in expected_output.len().saturating_sub(10)..expected_output.len() {
            println!("  [{}] = {}", i, expected_output[i]);
        }
    }

    // Compare lengths
    assert_eq!(
        result.len(),
        expected_output.len(),
        "Result length mismatch: got {}, expected {}",
        result.len(),
        expected_output.len()
    );

    // Compare values
    let mut differences = 0;
    let tolerance = 1e-5;
    let mut max_diff = 0.0f32;
    let mut max_diff_index = 0;

    for i in 0..result.len() {
        let expected = expected_output[i]
            .as_f64()
            .or_else(|| expected_output[i].as_i64().map(|n| n as f64))
            .expect("Expected value is not a number") as f32;
        let actual = result[i];
        let diff = (expected - actual).abs();

        if diff > tolerance {
            differences += 1;
            if diff > max_diff {
                max_diff = diff;
                max_diff_index = i;
            }
        }
    }

    if differences > 0 {
        println!("\n❌ Found {} differences", differences);
        println!(
            "Largest difference at index {}: expected {}, got {}, diff: {}",
            max_diff_index,
            expected_output[max_diff_index].as_f64().unwrap(),
            result[max_diff_index],
            max_diff
        );

        // Show first 20 values
        println!("\nFirst 20 values comparison:");
        for i in 0..20.min(result.len()) {
            let expected = expected_output[i]
                .as_f64()
                .or_else(|| expected_output[i].as_i64().map(|n| n as f64))
                .expect("Expected value is not a number") as f32;
            let actual = result[i];
            let diff = (expected - actual).abs();
            let match_str = if diff < tolerance { "✓" } else { "✗" };
            println!(
                "{}: {} Expected: {:e}, Actual: {:e}, Diff: {:e}",
                i, match_str, expected, actual, diff
            );
        }

        panic!("Values don't match!");
    } else {
        println!("\n✅ All values match within tolerance {}", tolerance);
    }
}
