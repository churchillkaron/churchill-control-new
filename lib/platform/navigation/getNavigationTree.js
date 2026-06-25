import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function buildTree(rows) {
  const map = {};
  const roots = [];

  rows.forEach((row) => {
    map[row.id] = {
      id: row.id,
      parent_id: row.parent_id,
      name: row.name,
      capability: row.capability,
      route: row.route,
      sort_order: row.sort_order || 0,
      children: [],
    };
  });

  rows.forEach((row) => {
    const node = map[row.id];

    if (row.parent_id && map[row.parent_id]) {
      map[row.parent_id].children.push(node);
    } else {
      roots.push(node);
    }
  });

  function sortNodes(nodes) {
    return nodes
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((node) => ({
        ...node,
        children: sortNodes(node.children || []),
      }));
  }

  return sortNodes(roots);
}

export async function getNavigationTree() {
  const { data, error } = await supabaseAdmin
    .from("platform_navigation")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    return {
      success: false,
      error: error.message,
      tree: [],
    };
  }

  const rows = data || [];
  const tree = buildTree(rows);
  return {
    success: true,
    tree,
  };

}
