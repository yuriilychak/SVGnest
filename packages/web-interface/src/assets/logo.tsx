import { memo } from 'react';

const Logo = () => (
    <svg className="logo" width="256" height="256" viewBox="0 0 256 256">
        <g transform="rotate(315 128 128)">
            <circle cx="128" cy="128" r="128" fill="#3bb34a" />
            <circle cx="128" cy="128" r="124" fill="#fff" />
            <g fill="#3bb34a">
                <circle cx="58" cy="164" r="25" />
                <circle cx="128" cy="92" r="25" />
                <circle cx="128" cy="164" r="25" />
                <circle cx="198" cy="92" r="25" />
            </g>
            <g fill="#fff">
                <circle cx="58" cy="164" r="22" />
                <circle cx="128" cy="164" r="22" />
                <circle cx="128" cy="92" r="22" />
                <circle cx="198" cy="92" r="22" />
            </g>
            <g fill="#3bb34a">
                <rect x="196" y="68" width="4" height="48" />
                <rect x="103" y="92" width="3" height="72" />
                <rect x="126" y="140" width="4" height="48" />
                <rect x="104" y="90" width="48" height="4" />
                <rect x="150" y="92" width="3" height="72" />
                <rect x="104" y="162" width="48" height="4" />
                <rect x="57" y="139" width="72" height="3" />
                <rect x="56" y="140" width="4" height="48" />
                <rect x="55" y="186" width="72" height="3" />
                <rect x="125" y="114" width="72" height="3" />
                <rect x="126" y="68" width="4" height="48" />
                <rect x="125" y="67" width="72" height="3" />
            </g>
        </g>
        <g fill="#d7e9b7">
            <circle cx="53" cy="152" r="44" />
            <circle cx="203" cy="104" r="44" />
            <circle cx="52" cy="75" r="31" />
            <circle cx="204" cy="181" r="31" />
            <circle cx="78" cy="32" r="16" />
            <circle cx="109" cy="22" r="16" />
            <circle cx="195" cy="44" r="16" />
            <circle cx="178" cy="223" r="16" />
            <circle cx="146" cy="234" r="16" />
            <circle cx="60" cy="212" r="16" />
            <circle cx="55" cy="37" r="7" />
            <circle cx="99" cy="43" r="7" />
            <circle cx="86" cy="55" r="7" />
            <circle cx="101" cy="58" r="7" />
            <circle cx="113" cy="46" r="7" />
            <circle cx="90" cy="69" r="7" />
            <circle cx="132" cy="28" r="7" />
            <circle cx="131" cy="11" r="7" />
            <circle cx="143" cy="19" r="7" />
            <circle cx="157" cy="15" r="7" />
            <circle cx="168" cy="25" r="7" />
            <circle cx="182" cy="24" r="7" />
            <circle cx="150" cy="104" r="7" />
            <circle cx="105" cy="153" r="7" />
            <circle cx="227" cy="150" r="7" />
            <circle cx="242" cy="150" r="7" />
            <circle cx="238" cy="164" r="7" />
            <circle cx="201" cy="219" r="7" />
            <circle cx="123" cy="229" r="7" />
            <circle cx="124" cy="245" r="7" />
            <circle cx="111" cy="238" r="7" />
            <circle cx="97" cy="241" r="7" />
            <circle cx="87" cy="231" r="7" />
            <circle cx="73" cy="231" r="7" />
            <circle cx="170" cy="201" r="7" />
            <circle cx="166" cy="187" r="7" />
            <circle cx="156" cy="198" r="7" />
            <circle cx="142" cy="211" r="7" />
            <circle cx="157" cy="213" r="7" />
            <circle cx="244" cy="136" r="7" />
            <circle cx="12" cy="121" r="7" />
            <circle cx="14" cy="106" r="7" />
            <circle cx="17" cy="92" r="7" />
            <circle cx="29" cy="106" r="7" />
        </g>
        <g fill="#fff">
            <circle cx="53" cy="152" r="41" />
            <circle cx="203" cy="104" r="41" />
            <circle cx="52" cy="75" r="28" />
            <circle cx="204" cy="181" r="28" />
            <circle cx="78" cy="32" r="13" />
            <circle cx="109" cy="22" r="13" />
            <circle cx="195" cy="44" r="13" />
            <circle cx="178" cy="223" r="13" />
            <circle cx="146" cy="234" r="13" />
            <circle cx="60" cy="212" r="13" />
            <circle cx="55" cy="37" r="5" />
            <circle cx="99" cy="43" r="5" />
            <circle cx="86" cy="55" r="5" />
            <circle cx="101" cy="58" r="5" />
            <circle cx="113" cy="46" r="5" />
            <circle cx="90" cy="69" r="5" />
            <circle cx="132" cy="28" r="5" />
            <circle cx="131" cy="11" r="5" />
            <circle cx="143" cy="19" r="5" />
            <circle cx="157" cy="15" r="5" />
            <circle cx="168" cy="25" r="5" />
            <circle cx="182" cy="24" r="5" />
            <circle cx="150" cy="104" r="5" />
            <circle cx="105" cy="153" r="5" />
            <circle cx="227" cy="150" r="5" />
            <circle cx="242" cy="150" r="5" />
            <circle cx="238" cy="164" r="5" />
            <circle cx="201" cy="219" r="5" />
            <circle cx="123" cy="229" r="5" />
            <circle cx="124" cy="245" r="5" />
            <circle cx="111" cy="238" r="5" />
            <circle cx="97" cy="241" r="5" />
            <circle cx="87" cy="231" r="5" />
            <circle cx="73" cy="231" r="5" />
            <circle cx="170" cy="201" r="5" />
            <circle cx="166" cy="187" r="5" />
            <circle cx="156" cy="198" r="5" />
            <circle cx="142" cy="211" r="5" />
            <circle cx="157" cy="213" r="5" />
            <circle cx="244" cy="136" r="5" />
            <circle cx="12" cy="121" r="5" />
            <circle cx="14" cy="106" r="5" />
            <circle cx="17" cy="92" r="5" />
            <circle cx="29" cy="106" r="5" />
        </g>
    </svg>
);

export default memo(Logo);
