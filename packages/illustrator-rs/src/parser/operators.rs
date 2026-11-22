use std::collections::HashMap;
use std::sync::LazyLock;

pub struct OperatorDef {
    pub name: &'static str,
    pub arg_count: Option<usize>,
    pub handler: &'static str,
}

static OPERATORS: LazyLock<HashMap<&'static str, OperatorDef>> = LazyLock::new(|| {
    let mut m = HashMap::new();

    // ── Path Geometry ──────────────────────────────────────
    m.insert("m", OperatorDef { name: "moveto", arg_count: Some(2), handler: "handle_moveto" });
    m.insert("l", OperatorDef { name: "lineto_smooth", arg_count: Some(2), handler: "handle_lineto" });
    m.insert("L", OperatorDef { name: "lineto_corner", arg_count: Some(2), handler: "handle_lineto" });
    m.insert("c", OperatorDef { name: "curveto_smooth", arg_count: Some(6), handler: "handle_curveto" });
    m.insert("C", OperatorDef { name: "curveto_corner", arg_count: Some(6), handler: "handle_curveto" });
    m.insert("v", OperatorDef { name: "curveto_v_smooth", arg_count: Some(4), handler: "handle_curveto_v" });
    m.insert("V", OperatorDef { name: "curveto_v_corner", arg_count: Some(4), handler: "handle_curveto_v" });
    m.insert("y", OperatorDef { name: "curveto_y_smooth", arg_count: Some(4), handler: "handle_curveto_y" });
    m.insert("Y", OperatorDef { name: "curveto_y_corner", arg_count: Some(4), handler: "handle_curveto_y" });
    m.insert("H", OperatorDef { name: "closepath", arg_count: Some(0), handler: "handle_closepath" });

    // ── Path Rendering ─────────────────────────────────────
    m.insert("N", OperatorDef { name: "path_noop_open", arg_count: Some(0), handler: "handle_render" });
    m.insert("n", OperatorDef { name: "path_noop_closed", arg_count: Some(0), handler: "handle_render" });
    m.insert("F", OperatorDef { name: "fill_open", arg_count: Some(0), handler: "handle_render" });
    m.insert("f", OperatorDef { name: "fill_closed", arg_count: Some(0), handler: "handle_render" });
    m.insert("S", OperatorDef { name: "stroke_open", arg_count: Some(0), handler: "handle_render" });
    m.insert("s", OperatorDef { name: "stroke_closed", arg_count: Some(0), handler: "handle_render" });
    m.insert("B", OperatorDef { name: "fill_stroke_open", arg_count: Some(0), handler: "handle_render" });
    m.insert("b", OperatorDef { name: "fill_stroke_closed", arg_count: Some(0), handler: "handle_render" });

    // ── Colors ─────────────────────────────────────────────
    // Grayscale
    m.insert("g", OperatorDef { name: "gray_fill", arg_count: Some(1), handler: "handle_gray_fill" });
    m.insert("G", OperatorDef { name: "gray_stroke", arg_count: Some(1), handler: "handle_gray_stroke" });
    // CMYK
    m.insert("k", OperatorDef { name: "cmyk_fill", arg_count: Some(4), handler: "handle_cmyk_fill" });
    m.insert("K", OperatorDef { name: "cmyk_stroke", arg_count: Some(4), handler: "handle_cmyk_stroke" });
    // RGB (AI extended)
    m.insert("Xa", OperatorDef { name: "rgb_fill", arg_count: Some(3), handler: "handle_rgb_fill" });
    m.insert("XA", OperatorDef { name: "rgb_stroke", arg_count: Some(3), handler: "handle_rgb_stroke" });
    // Spot colors
    m.insert("x", OperatorDef { name: "spot_fill", arg_count: None, handler: "handle_spot_fill" });
    m.insert("X", OperatorDef { name: "spot_stroke", arg_count: None, handler: "handle_spot_stroke" });
    // Custom color (AI8+)
    m.insert("Xx", OperatorDef { name: "custom_fill", arg_count: None, handler: "handle_custom_fill" });
    m.insert("XX", OperatorDef { name: "custom_stroke", arg_count: None, handler: "handle_custom_stroke" });

    // ── Paint Style ────────────────────────────────────────
    m.insert("w", OperatorDef { name: "line_width", arg_count: Some(1), handler: "handle_line_width" });
    m.insert("J", OperatorDef { name: "line_cap", arg_count: Some(1), handler: "handle_line_cap" });
    m.insert("j", OperatorDef { name: "line_join", arg_count: Some(1), handler: "handle_line_join" });
    m.insert("M", OperatorDef { name: "miter_limit", arg_count: Some(1), handler: "handle_miter_limit" });
    m.insert("d", OperatorDef { name: "dash", arg_count: None, handler: "handle_dash" });
    m.insert("i", OperatorDef { name: "flatness", arg_count: Some(1), handler: "handle_noop" });
    m.insert("D", OperatorDef { name: "setdash_ai", arg_count: None, handler: "handle_dash" });

    // ── Graphics State ─────────────────────────────────────
    m.insert("q", OperatorDef { name: "gsave", arg_count: Some(0), handler: "handle_gsave" });
    m.insert("Q", OperatorDef { name: "grestore", arg_count: Some(0), handler: "handle_grestore" });
    m.insert("W", OperatorDef { name: "clip", arg_count: Some(0), handler: "handle_clip" });
    m.insert("cm", OperatorDef { name: "concat_matrix", arg_count: Some(6), handler: "handle_concat_matrix" });

    // ── Groups ─────────────────────────────────────────────
    m.insert("u", OperatorDef { name: "begin_group", arg_count: Some(0), handler: "handle_begin_group" });
    m.insert("U", OperatorDef { name: "end_group", arg_count: Some(0), handler: "handle_end_group" });
    m.insert("*u", OperatorDef { name: "begin_compound", arg_count: Some(0), handler: "handle_begin_compound" });
    m.insert("*U", OperatorDef { name: "end_compound", arg_count: Some(0), handler: "handle_end_compound" });

    // ── Layers ─────────────────────────────────────────────
    m.insert("Lb", OperatorDef { name: "begin_layer", arg_count: None, handler: "handle_begin_layer" });
    m.insert("LB", OperatorDef { name: "end_layer", arg_count: Some(0), handler: "handle_end_layer" });
    m.insert("Ln", OperatorDef { name: "layer_name", arg_count: Some(1), handler: "handle_layer_name" });

    // ── Text ───────────────────────────────────────────────
    m.insert("To", OperatorDef { name: "begin_text", arg_count: Some(1), handler: "handle_begin_text" });
    m.insert("TO", OperatorDef { name: "end_text", arg_count: Some(0), handler: "handle_end_text" });
    m.insert("Tp", OperatorDef { name: "text_path", arg_count: Some(6), handler: "handle_text_path" });
    m.insert("TP", OperatorDef { name: "end_text_path", arg_count: Some(0), handler: "handle_end_text_path" });
    m.insert("Tx", OperatorDef { name: "text_render", arg_count: Some(1), handler: "handle_text_render" });
    m.insert("TX", OperatorDef { name: "text_render_end", arg_count: Some(0), handler: "handle_noop" });
    m.insert("Tf", OperatorDef { name: "text_font", arg_count: Some(2), handler: "handle_text_font" });
    m.insert("Tj", OperatorDef { name: "text_show", arg_count: Some(1), handler: "handle_text_render" });
    m.insert("TJ", OperatorDef { name: "text_show_kerned", arg_count: None, handler: "handle_noop" });
    m.insert("Tk", OperatorDef { name: "text_tracking", arg_count: Some(2), handler: "handle_noop" });
    m.insert("Tc", OperatorDef { name: "text_char_spacing", arg_count: Some(1), handler: "handle_noop" });
    m.insert("Tw", OperatorDef { name: "text_word_spacing", arg_count: Some(1), handler: "handle_noop" });
    m.insert("Ts", OperatorDef { name: "text_rise", arg_count: Some(1), handler: "handle_noop" });
    m.insert("Ti", OperatorDef { name: "text_indent", arg_count: Some(1), handler: "handle_noop" });
    m.insert("Tz", OperatorDef { name: "text_horiz_scale", arg_count: Some(1), handler: "handle_noop" });
    m.insert("TA", OperatorDef { name: "text_alignment", arg_count: None, handler: "handle_noop" });
    m.insert("Tq", OperatorDef { name: "text_hanging_punct", arg_count: None, handler: "handle_noop" });

    // ── Gradients ──────────────────────────────────────────
    m.insert("Bb", OperatorDef { name: "begin_gradient", arg_count: Some(1), handler: "handle_begin_gradient" });
    m.insert("BB", OperatorDef { name: "end_gradient", arg_count: Some(0), handler: "handle_end_gradient" });
    m.insert("Bd", OperatorDef { name: "begin_gradient_def", arg_count: None, handler: "handle_begin_gradient_def" });
    m.insert("BD", OperatorDef { name: "end_gradient_def", arg_count: Some(0), handler: "handle_end_gradient_def" });
    m.insert("Bg", OperatorDef { name: "gradient_geometry", arg_count: None, handler: "handle_gradient_geometry" });
    m.insert("Bs", OperatorDef { name: "gradient_stop", arg_count: None, handler: "handle_gradient_stop" });
    m.insert("BR", OperatorDef { name: "gradient_ramp", arg_count: None, handler: "handle_noop" });
    m.insert("Bm", OperatorDef { name: "gradient_midpoint", arg_count: None, handler: "handle_noop" });

    // ── Patterns ───────────────────────────────────────────
    m.insert("E", OperatorDef { name: "begin_pattern", arg_count: None, handler: "handle_noop" });
    m.insert("e", OperatorDef { name: "end_pattern", arg_count: Some(0), handler: "handle_noop" });

    // ── Symbols ────────────────────────────────────────────
    m.insert("AI5_SetPalette", OperatorDef { name: "set_palette", arg_count: None, handler: "handle_noop" });

    // ── Raster Images ──────────────────────────────────────
    m.insert("XI", OperatorDef { name: "raster_image", arg_count: None, handler: "handle_raster_image" });

    // ── Placed/Linked Files ────────────────────────────────
    m.insert("'", OperatorDef { name: "placed_file", arg_count: None, handler: "handle_noop" });

    // ── Document Structure ─────────────────────────────────
    m.insert("Adobe_Illustrator_AI5", OperatorDef { name: "ai5_procset", arg_count: Some(1), handler: "handle_noop" });
    m.insert("Adobe_ctte", OperatorDef { name: "ctte_procset", arg_count: None, handler: "handle_noop" });
    m.insert("Adobe_level2_AI5", OperatorDef { name: "level2_procset", arg_count: None, handler: "handle_noop" });
    m.insert("Adobe_ColorImage_AI6", OperatorDef { name: "colorimage_procset", arg_count: None, handler: "handle_noop" });
    m.insert("Adobe_shading_AI8", OperatorDef { name: "shading_procset", arg_count: None, handler: "handle_noop" });

    // ── Misc Operators ─────────────────────────────────────
    m.insert("pop", OperatorDef { name: "pop", arg_count: Some(0), handler: "handle_pop" });
    m.insert("def", OperatorDef { name: "define", arg_count: Some(0), handler: "handle_noop" });
    m.insert("exec", OperatorDef { name: "exec", arg_count: Some(0), handler: "handle_noop" });
    m.insert("null", OperatorDef { name: "null", arg_count: Some(0), handler: "handle_null" });
    m.insert("true", OperatorDef { name: "true", arg_count: Some(0), handler: "handle_true" });
    m.insert("false", OperatorDef { name: "false", arg_count: Some(0), handler: "handle_false" });
    m.insert("bind", OperatorDef { name: "bind", arg_count: Some(0), handler: "handle_noop" });
    m.insert("dup", OperatorDef { name: "dup", arg_count: Some(0), handler: "handle_dup" });
    m.insert("exch", OperatorDef { name: "exch", arg_count: Some(0), handler: "handle_exch" });
    m.insert("copy", OperatorDef { name: "copy", arg_count: Some(1), handler: "handle_noop" });
    m.insert("index", OperatorDef { name: "index", arg_count: Some(1), handler: "handle_noop" });
    m.insert("roll", OperatorDef { name: "roll", arg_count: Some(2), handler: "handle_noop" });
    m.insert("cleartomark", OperatorDef { name: "cleartomark", arg_count: Some(0), handler: "handle_noop" });
    m.insert("counttomark", OperatorDef { name: "counttomark", arg_count: Some(0), handler: "handle_noop" });
    m.insert("mark", OperatorDef { name: "mark", arg_count: Some(0), handler: "handle_noop" });
    m.insert("setgray", OperatorDef { name: "setgray", arg_count: Some(1), handler: "handle_noop" });
    m.insert("setrgbcolor", OperatorDef { name: "setrgbcolor", arg_count: Some(3), handler: "handle_noop" });
    m.insert("setcmykcolor", OperatorDef { name: "setcmykcolor", arg_count: Some(4), handler: "handle_noop" });
    m.insert("currentpoint", OperatorDef { name: "currentpoint", arg_count: Some(0), handler: "handle_noop" });
    m.insert("moveto", OperatorDef { name: "ps_moveto", arg_count: Some(2), handler: "handle_noop" });
    m.insert("lineto", OperatorDef { name: "ps_lineto", arg_count: Some(2), handler: "handle_noop" });
    m.insert("curveto", OperatorDef { name: "ps_curveto", arg_count: Some(6), handler: "handle_noop" });
    m.insert("closepath", OperatorDef { name: "ps_closepath", arg_count: Some(0), handler: "handle_noop" });
    m.insert("fill", OperatorDef { name: "ps_fill", arg_count: Some(0), handler: "handle_noop" });
    m.insert("stroke", OperatorDef { name: "ps_stroke", arg_count: Some(0), handler: "handle_noop" });
    m.insert("newpath", OperatorDef { name: "ps_newpath", arg_count: Some(0), handler: "handle_noop" });
    m.insert("gsave", OperatorDef { name: "ps_gsave", arg_count: Some(0), handler: "handle_noop" });
    m.insert("grestore", OperatorDef { name: "ps_grestore", arg_count: Some(0), handler: "handle_noop" });
    m.insert("showpage", OperatorDef { name: "ps_showpage", arg_count: Some(0), handler: "handle_noop" });
    m.insert("translate", OperatorDef { name: "ps_translate", arg_count: Some(2), handler: "handle_noop" });
    m.insert("scale", OperatorDef { name: "ps_scale", arg_count: Some(2), handler: "handle_noop" });
    m.insert("rotate", OperatorDef { name: "ps_rotate", arg_count: Some(1), handler: "handle_noop" });
    m.insert("concat", OperatorDef { name: "ps_concat", arg_count: None, handler: "handle_noop" });
    m.insert("setlinewidth", OperatorDef { name: "ps_setlinewidth", arg_count: Some(1), handler: "handle_noop" });
    m.insert("setlinecap", OperatorDef { name: "ps_setlinecap", arg_count: Some(1), handler: "handle_noop" });
    m.insert("setlinejoin", OperatorDef { name: "ps_setlinejoin", arg_count: Some(1), handler: "handle_noop" });
    m.insert("setmiterlimit", OperatorDef { name: "ps_setmiterlimit", arg_count: Some(1), handler: "handle_noop" });
    m.insert("setdash", OperatorDef { name: "ps_setdash", arg_count: None, handler: "handle_noop" });
    m.insert("clip", OperatorDef { name: "ps_clip", arg_count: Some(0), handler: "handle_noop" });
    m.insert("image", OperatorDef { name: "ps_image", arg_count: None, handler: "handle_noop" });
    m.insert("colorimage", OperatorDef { name: "ps_colorimage", arg_count: None, handler: "handle_noop" });

    // ── Opacity (AI9+) ────────────────────────────────────
    m.insert("Ap", OperatorDef { name: "opacity_attrs", arg_count: None, handler: "handle_noop" });

    // ── Overprint ──────────────────────────────────────────
    m.insert("O", OperatorDef { name: "overprint_fill", arg_count: Some(1), handler: "handle_noop" });
    m.insert("R", OperatorDef { name: "overprint_stroke", arg_count: Some(1), handler: "handle_noop" });

    // ── Winding Rule ───────────────────────────────────────
    m.insert("Xw", OperatorDef { name: "winding_rule", arg_count: Some(1), handler: "handle_noop" });

    // ── Extended Paint Style (AI8+) ────────────────────
    m.insert("XR", OperatorDef { name: "xr_paint_style", arg_count: Some(1), handler: "handle_noop" });
    m.insert("XW", OperatorDef { name: "xw_paint_style", arg_count: Some(2), handler: "handle_noop" });
    m.insert("Xd", OperatorDef { name: "xd_paint_style", arg_count: None, handler: "handle_noop" });
    m.insert("Xm", OperatorDef { name: "xm_paint_style", arg_count: None, handler: "handle_noop" });
    m.insert("Xs", OperatorDef { name: "xs_paint_style", arg_count: None, handler: "handle_noop" });
    m.insert("Xy", OperatorDef { name: "xy_paint_style", arg_count: Some(5), handler: "handle_noop" });
    m.insert("XS", OperatorDef { name: "xs_stroke_style", arg_count: None, handler: "handle_noop" });

    // ── Appearance / Effects (AI9+) ────────────────────
    m.insert("Ae", OperatorDef { name: "appearance_end", arg_count: Some(1), handler: "handle_appearance_end" });
    m.insert("AE", OperatorDef { name: "appearance_expand", arg_count: Some(1), handler: "handle_noop" });
    m.insert("As", OperatorDef { name: "appearance_style", arg_count: Some(1), handler: "handle_appearance_style" });
    m.insert("A", OperatorDef { name: "appearance_a", arg_count: Some(1), handler: "handle_noop" });
    m.insert("Ar", OperatorDef { name: "appearance_ref", arg_count: None, handler: "handle_noop" });

    // ── Encoding / Setup ──────────────────────────────
    m.insert("TE", OperatorDef { name: "text_encoding", arg_count: None, handler: "handle_noop" });
    m.insert("TZ", OperatorDef { name: "text_zap_font", arg_count: None, handler: "handle_noop" });
    m.insert("Np", OperatorDef { name: "nonprointing_begin", arg_count: Some(0), handler: "handle_noop" });
    m.insert("NP", OperatorDef { name: "nonprointing_end", arg_count: Some(0), handler: "handle_noop" });

    // ── Pattern/Brush ──────────────────────────────────
    m.insert("Pb", OperatorDef { name: "pattern_brush_begin", arg_count: None, handler: "handle_noop" });
    m.insert("PB", OperatorDef { name: "pattern_brush_end", arg_count: Some(0), handler: "handle_noop" });
    m.insert("Pc", OperatorDef { name: "pattern_color", arg_count: None, handler: "handle_noop" });
    m.insert("Pg", OperatorDef { name: "pattern_gradient", arg_count: None, handler: "handle_noop" });
    m.insert("p", OperatorDef { name: "pattern_fill", arg_count: None, handler: "handle_noop" });

    // ── Blend/Live Color ───────────────────────────────
    m.insert("Bc", OperatorDef { name: "blend_color", arg_count: None, handler: "handle_noop" });
    m.insert("Bh", OperatorDef { name: "blend_highlight", arg_count: None, handler: "handle_noop" });
    m.insert("Bn", OperatorDef { name: "blend_name", arg_count: None, handler: "handle_noop" });

    // ── Page Annotation ────────────────────────────────
    m.insert("annotatepage", OperatorDef { name: "annotate_page", arg_count: None, handler: "handle_noop" });

    // ── Punctuation tokens from gradient ramp data ─────
    m.insert(",", OperatorDef { name: "comma", arg_count: Some(0), handler: "handle_noop" });
    m.insert(":", OperatorDef { name: "colon", arg_count: Some(0), handler: "handle_noop" });
    m.insert(";", OperatorDef { name: "semicolon", arg_count: Some(0), handler: "handle_noop" });
    m.insert("-", OperatorDef { name: "dash_char", arg_count: Some(0), handler: "handle_noop" });
    m.insert(".", OperatorDef { name: "dot_char", arg_count: Some(0), handler: "handle_noop" });

    m
});

pub fn get_operator(name: &str) -> Option<&'static OperatorDef> {
    OPERATORS.get(name)
}
