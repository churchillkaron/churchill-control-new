select
  count(*) as assistant_rows,
  count(*) filter (
    where decision ? 'response_text'
       or decision ? 'agreement_state'
       or decision ? 'project_state'
  ) as rows_with_duplicates,
  sum(pg_column_size(decision)) as decision_bytes_before,
  sum(pg_column_size(
    decision - 'response_text' - 'agreement_state' - 'project_state'
  )) as decision_bytes_after,
  sum(
    pg_column_size(decision) -
    pg_column_size(decision - 'response_text' - 'agreement_state' - 'project_state')
  ) as avoidable_duplicate_bytes
from intelligence_turns
where role = 'assistant';
