export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json({
    success: false,
    message: "Checkout disabled",
  });
}