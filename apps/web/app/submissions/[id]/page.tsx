import { ReviewWorkspace } from "./_components/review-workspace";

export default async function SubmissionPage(props: PageProps<"/submissions/[id]">) {
  const { id } = await props.params;
  return <ReviewWorkspace id={id} />;
}
