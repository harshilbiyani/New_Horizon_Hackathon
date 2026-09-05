import argparse
import sys

def main():
    parser = argparse.ArgumentParser(description="DroneShield Autonomy")
    parser.add_argument("--mode", choices=["simulation", "sitl"], default="sitl",
                        help="Mode to run: pure simulation or SITL with MAVLink")
    parser.add_argument("--connection", default="tcp:127.0.0.1:5762",
                        help="MAVLink connection string")
    
    parser.add_argument("--auto-arm", action="store_true",
                        help="Automatically arm and take off the drone (use only in SITL)")
    parser.add_argument("--swarm", action="store_true",
                        help="Start 5 concurrent SITL autonomy threads")
    
    args = parser.parse_args()

    if args.mode == "simulation":
        print("\nStarting Simulation Mode...\n")
        from simulation import main as run_simulation
        run_simulation()
    
    elif args.mode == "sitl":
        print("\nStarting SITL Autonomy Mode...\n")
        from autonomy import DroneShieldAutonomy
        
        if args.swarm:
            print("Launching DroneShield Swarm Coordinator (5 SITL)")
            import threading
            threads = []
            for i in range(5):
                port = 5762 + i * 10
                conn = f"tcp:127.0.0.1:{port}"
                drone_id = i + 1
                
                def start_agent(c, d_id):
                    try:
                        agent = DroneShieldAutonomy(connection_string=c, is_simulation=True, auto_arm=args.auto_arm, drone_id=d_id)
                        agent.run()
                    except Exception as e:
                        print(f"Failed to start drone {d_id}: {e}")

                t = threading.Thread(target=start_agent, args=(conn, drone_id), daemon=True)
                t.start()
                threads.append(t)
            
            try:
                for t in threads:
                    t.join()
            except KeyboardInterrupt:
                print("Exiting swarm.")
        else:
            agent = DroneShieldAutonomy(connection_string=args.connection, is_simulation=True, auto_arm=args.auto_arm)
            agent.run()

if __name__ == "__main__":
    main()