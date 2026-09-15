import { getCompaniesWithJobCounts } from '@/lib/db/queries'
import CompaniesList, { type CompanyRow } from './CompaniesList'

export const dynamic = 'force-dynamic'

export default async function CompaniesPage() {
  const companies = await getCompaniesWithJobCounts()
  return <CompaniesList companies={companies as CompanyRow[]} />
}
