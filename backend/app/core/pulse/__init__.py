"""Campus Pulse — weekly LLM report of top topics and complaints (campus-pulse branch only).

Pipeline: collect.py (gather + de-identify) -> pipeline.py (LLM classifies,
code counts and enforces privacy) -> runner.py (background jobs, schedule).
"""
