// PostgREST (Supabase) caps each request at a default of 1000 rows. Any query
// that needs the full contents of a table (e.g. all users' predictions for the
// leaderboard) must paginate explicitly, otherwise rows are silently dropped.

const DEFAULT_PAGE_SIZE = 1000;

type RangeQueryBuilder<Row> = {
  range: (
    from: number,
    to: number
  ) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
};

/**
 * Fetches every row matching the provided query builder by paging through the
 * results in chunks of `pageSize`. The `makeQuery` callback must return a fresh
 * query builder on each call so a new `.range(...)` can be applied.
 */
export async function fetchAllRows<Row>(
  makeQuery: () => RangeQueryBuilder<Row>,
  pageSize = DEFAULT_PAGE_SIZE
): Promise<{ data: Row[]; error: { message: string } | null }> {
  const all: Row[] = [];

  for (let page = 0; ; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await makeQuery().range(from, to);

    if (error) {
      return { data: all, error };
    }

    if (!data || data.length === 0) {
      break;
    }

    all.push(...data);

    if (data.length < pageSize) {
      break;
    }
  }

  return { data: all, error: null };
}
