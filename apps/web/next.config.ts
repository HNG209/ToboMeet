import {NextConfig} from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  experimental: {
    staleTimes: {
      dynamic: 180,
      static: 300,
    },
  },
  /* config options here */
  async redirects() {
    return [
      {
        source: '/:locale/dashboard/calendar',
        destination: '/:locale/calendar',
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
