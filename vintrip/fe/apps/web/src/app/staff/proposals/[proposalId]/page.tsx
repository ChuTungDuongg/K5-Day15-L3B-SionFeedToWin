import { ProposalDetailScreen } from '@/features/staff/proposal-detail-screen';

export default async function StaffProposalDetailPage({ params }: {
  params: Promise<{ proposalId: string }>;
}) {
  const { proposalId } = await params;
  return <ProposalDetailScreen key={proposalId} proposalId={proposalId} />;
}
