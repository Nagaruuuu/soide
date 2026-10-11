"""Sandbox giải toán số — chạy tiến trình riêng, không mạng, timeout 5s.
Vào: JSON 1 dòng qua argv[1]: {"content": "...", "opt_a":..,"opt_b":..,"opt_c":..,"opt_d":..}
Ra: JSON 1 dòng: {"value": <float|str|null>, "steps": "...", "method": "computed"}
Quy tắc an toàn:
- Cấm import socket/os/sys/subprocess/pathlib/open/file.
- Chỉ cho phép math + biểu thức số (+-*/()^%).
- Nếu không phải bài số -> value=null.
"""
import json, sys, re, math

BLOCKED = ["socket", "os", "sys", "subprocess", "pathlib", "open(",
           "urllib", "requests", "http", "__import__", "eval", "exec", "import"]

def parse_number(s):
    if s is None: return None
    s = str(s).strip().replace(",", ".")
    m = re.search(r"[-+]?\d+(?:\.\d+)?", s)
    return float(m.group(0)) if m else None

def safe_eval(expr):
    expr = expr.strip().replace("^", "**").replace("x", "*").replace("×", "*").replace("÷", "/")
    if any(b in expr for b in BLOCKED): return None
    if not re.fullmatch(r"[\d\s\.\+\-\*\/\%\(\)]+", expr): return None
    try:
        return float(eval(expr, {"__builtins__": {}}, {"math": math}))
    except Exception:
        return None

def main():
    try:
        q = json.loads(sys.argv[1] if len(sys.argv) > 1 else "{}")
    except Exception:
        print(json.dumps({"value": None, "steps": "input JSON lỗi", "method": "computed"})); return
    content = str(q.get("content", ""))
    # tìm biểu thức sau "bằng bao nhiêu", "=", "tính", "kết quả"
    m = re.search(r"(?:bằng bao nhiêu|tính|kết quả|giá trị)[^\d\-]*([\d\s\.\+\-\*\/x\^\%\(\)]+)", content, re.I)
    if not m:
        m = re.search(r"([\d][\d\s\.\+\-\*\/x\^\%\(\)]{2,})", content)
    if not m:
        print(json.dumps({"value": None, "steps": "không phải bài số", "method": "computed"})); return
    expr = m.group(1).strip()
    val = safe_eval(expr)
    if val is None:
        print(json.dumps({"value": None, "steps": "không tính được an toàn", "method": "computed"})); return
    print(json.dumps({"value": val, "steps": f"{expr} = {val}", "method": "computed"}))

if __name__ == "__main__":
    main()
