-- 2026-11-24: staff phones never saw their warnings / IR / absences. These read RPCs were STABLE, so PostgREST ran them in a
-- READ ONLY transaction, but pr_emp_check writes (sign-in / token bookkeeping) → every call failed with HTTP 405 since
-- at least 11/23. Staff-callable RPCs that start with pr_emp_check must be VOLATILE (the default).
alter function public.pr_emp_warnings(text, text) volatile;
alter function public.pr_emp_absences(text, text) volatile;
alter function public.pr_emp_warn_proof(text, text, uuid) volatile;
