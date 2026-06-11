import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function ExecutionsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/flows'); }, [router]);
  return null;
}
