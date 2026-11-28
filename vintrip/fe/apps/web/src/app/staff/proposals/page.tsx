import { parseApprovalRoleParam, parseProposalStatusParam } from '@/features/staff/proposal-helpers';
import { ProposalsListScreen } from '@/features/staff/proposals-list-screen';

export default async function StaffProposalsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const search = await searchParams;
  const status = parseProposalStatusParam(search.status);
  const requiredApprovalRole = parseApprovalRoleParam(search.requiredApprovalRole);
  const bookingCode = typeof search.bookingCode === 'string' ? search.bookingCode.trim() : '';
  return <ProposalsListScreen key={JSON.stringify([status, requiredApprovalRole, bookingCode])}
    initialStatus={status} initialApprovalRole={requiredApprovalRole} initialBookingCode={bookingCode} />;
}
