use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn rank_links(links: &JsValue, target: &str) -> JsValue {
    let links_array: Vec<String> = serde_wasm_bindgen::from_value(links.clone()).unwrap_or_default();
    let target_key = target.trim().to_lowercase();

    let mut scored: Vec<(String, i32)> = links_array
        .into_iter()
        .map(|candidate| {
            let candidate_key = candidate.trim().to_lowercase();
            let tokens: Vec<&str> = target_key.split_whitespace().collect();
            let overlap = tokens.iter().filter(|token| candidate_key.contains(*token)).count() as i32;
            let exact = if candidate_key == target_key { 100 } else { 0 };
            let prefix_bonus = if target_key.starts_with(&candidate_key) || candidate_key.starts_with(&target_key) {
                20
            } else {
                0
            };
            (candidate, exact + overlap * 25 + prefix_bonus)
        })
        .collect();

    scored.sort_by(|a, b| b.1.cmp(&a.1));
    let ranked: Vec<String> = scored.into_iter().map(|(candidate, _)| candidate).collect();
    serde_wasm_bindgen::to_value(&ranked).unwrap()
}

#[wasm_bindgen]
pub fn find_path_hint(start: &str, target: &str, links: &JsValue) -> JsValue {
    let links_array: Vec<String> = serde_wasm_bindgen::from_value(links.clone()).unwrap_or_default();
    let target_key = target.trim().to_lowercase();
    let start_key = start.trim().to_lowercase();

    if start_key == target_key {
        return serde_wasm_bindgen::to_value(&vec![start.to_string()]).unwrap();
    }

    if let Some(candidate) = links_array.iter().find(|candidate| candidate.trim().to_lowercase() == target_key) {
        return serde_wasm_bindgen::to_value(&vec![start.to_string(), candidate.clone()]).unwrap();
    }

    let mut scored: Vec<(String, i32)> = links_array
        .into_iter()
        .map(|candidate| {
            let candidate_key = candidate.trim().to_lowercase();
            let tokens: Vec<&str> = target_key.split_whitespace().collect();
            let overlap = tokens.iter().filter(|token| candidate_key.contains(*token)).count() as i32;
            let exact = if candidate_key == target_key { 100 } else { 0 };
            let prefix_bonus = if target_key.starts_with(&candidate_key) || candidate_key.starts_with(&target_key) {
                20
            } else {
                0
            };
            (candidate, exact + overlap * 25 + prefix_bonus)
        })
        .collect();

    scored.sort_by(|a, b| b.1.cmp(&a.1));
    let ranked: Vec<String> = scored.into_iter().map(|(candidate, _)| candidate).collect();
    serde_wasm_bindgen::to_value(&ranked).unwrap()
}
