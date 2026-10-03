import { CustomizerShell } from '@/components/customizer/customizer-shell';

export default async function Home(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  return <CustomizerShell initialSearchParams={searchParams} />;
}
