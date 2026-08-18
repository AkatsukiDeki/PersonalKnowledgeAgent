import json
import yaml
import os

def generate_report():
    dataset_path = os.path.join("evaluation", "dataset", "questions.yaml")
    results_path = os.path.join("evaluation", "benchmark_results.json")
    report_path = os.path.join("evaluation", "benchmark_report.md")
    
    if not os.path.exists(results_path):
        print("Results file not found. Run runner.py first.")
        return
        
    with open(dataset_path, "r", encoding="utf-8") as f:
        suite = yaml.safe_load(f)
        
    with open(results_path, "r", encoding="utf-8") as f:
        results = json.load(f)
        
    suite_map = {q["id"]: q for q in suite}
    
    metrics = {
        "factual": {"total": 0, "passed": 0},
        "temporal": {"total": 0, "passed": 0},
        "negative": {"total": 0, "passed": 0},
        "cross_domain": {"total": 0, "passed": 0},
        "graph": {"total": 0, "passed": 0},
    }
    
    for res in results:
        if "error" in res:
            continue
            
        qid = res["id"]
        qdata = suite_map[qid]
        cat = qdata["category"]
        expected = qdata["expected"]
        
        metrics[cat]["total"] += 1
        
        passed = True
        
        if cat == "negative":
            # For negative, it should NOT pass the evidence gate
            if res["evidence_gate_passed"]:
                passed = False
        else:
            # For others, it MUST pass the evidence gate
            if not res["evidence_gate_passed"]:
                passed = False
            
            # Check required layers
            req_layers = expected.get("required_layers", [])
            for layer in req_layers:
                if layer == "L1" and res["l1_count"] == 0:
                    passed = False
                elif layer == "L2" and res["l2_count"] == 0:
                    passed = False
                elif layer == "L3" and res["l3_count"] == 0:
                    passed = False
                elif layer == "L4" and res["l4_count"] == 0:
                    passed = False
                elif layer == "GRAPH" and res["graph_hops"] == 0:
                    passed = False
                    
        if passed:
            metrics[cat]["passed"] += 1
            
    # Calculate percentages
    report_lines = [
        "# RAG Evaluation Report",
        "",
        "## Metrics Summary",
        "| Category | Total | Passed | Accuracy |",
        "|----------|-------|--------|----------|"
    ]
    
    for cat, data in metrics.items():
        total = data["total"]
        passed = data["passed"]
        acc = (passed / total * 100) if total > 0 else 0
        report_lines.append(f"| {cat.capitalize()} | {total} | {passed} | {acc:.1f}% |")
        
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("\n".join(report_lines))
        
    print(f"Report generated at {report_path}")

if __name__ == "__main__":
    generate_report()
